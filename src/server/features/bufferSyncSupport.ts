/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Uri, disposeAll, workspace } from 'coc.nvim'
import { CancellationTokenSource, Emitter, Event, DidChangeTextDocumentParams, Disposable, TextDocumentContentChangeEvent } from 'vscode-languageserver-protocol'
import { TextDocument } from 'vscode-languageserver-textdocument'
import Proto from '../protocol'
import { ITypeScriptServiceClient } from '../typescriptService'
import API from '../utils/api'
import { Delayer } from '../utils/async'
import * as typeConverters from '../utils/typeConverters'
import * as languageModeIds from '../utils/languageModeIds'

function mode2ScriptKind(
  mode: string
): 'TS' | 'TSX' | 'JS' | 'JSX' | undefined {
  switch (mode) {
    case languageModeIds.typescript:
      return 'TS'
    case languageModeIds.typescripttsx:
      return 'TSX'
    case languageModeIds.typescriptjsx:
      return 'TSX'
    case languageModeIds.typescriptreact:
      return 'TSX'
    case languageModeIds.javascript:
      return 'JS'
    case languageModeIds.javascriptreact:
      return 'JSX'
  }
  return undefined
}

/**
 * Manages synchronization of buffers with the TS server.
 *
 * If supported, batches together file changes. This allows the TS server to more efficiently process changes.
 */
class BufferSynchronizer {

  private _pending: Proto.UpdateOpenRequestArgs = {}
  private _pendingFiles = new Set<string>()

  constructor(
    private readonly client: ITypeScriptServiceClient
  ) { }

  public open(args: Proto.OpenRequestArgs): void {
    this.client.executeWithoutWaitingForResponse('open', args)
  }

  public close(filepath: string): void {
    const args: Proto.FileRequestArgs = { file: filepath }
    this.client.executeWithoutWaitingForResponse('close', args)
  }

  public change(filepath: string, events: TextDocumentContentChangeEvent[]): void {
    if (!events.length) {
      return
    }

    if (this.supportsBatching) {
      this.updatePending(filepath, pending => {
        if (!pending.changedFiles) {
          pending.changedFiles = []
        }
        pending.changedFiles.push({
          fileName: filepath,
          textChanges: events.map((change): Proto.CodeEdit => ({
            newText: change.text,
            start: typeConverters.Position.toLocation((change as any).range.start),
            end: typeConverters.Position.toLocation((change as any).range.end),
          })).reverse(), // Send the edits end-of-document to start-of-document order
        })
      })
    } else {
      for (const event of events) {
        const args: Proto.ChangeRequestArgs = {
          insertString: event.text,
          ...typeConverters.Range.toFormattingRequestArgs(filepath, (event as any).range)
        }
        this.client.executeWithoutWaitingForResponse('change', args)
      }
    }
  }

  public beforeCommand(command: string): void {
    if (command === 'updateOpen') {
      return
    }

    this.flush()
  }

  private flush(): void {
    if (!this.supportsBatching) {
      // We've already eagerly synchronized
      return
    }

    if (this._pending.changedFiles) {
      this.client.executeWithoutWaitingForResponse('updateOpen', this._pending)
      this._pending = {}
      this._pendingFiles.clear()
    }
  }

  private get supportsBatching(): boolean {
    return this.client.apiVersion.gte(API.v340) && workspace.getConfiguration('tsserver').get<boolean>('useBatchedBufferSync', true)
  }

  private updatePending(filepath: string, f: (pending: Proto.UpdateOpenRequestArgs) => void): void {
    if (this.supportsBatching && this._pendingFiles.has(filepath)) {
      this.flush()
      this._pendingFiles.clear()
      f(this._pending)
      this._pendingFiles.add(filepath)
    } else {
      f(this._pending)
    }
  }
}

export default class BufferSyncSupport {
  private readonly client: ITypeScriptServiceClient

  private readonly modeIds: Set<string>
  private readonly uris: Set<string> = new Set()
  private readonly disposables: Disposable[] = []

  private readonly pendingDiagnostics = new Map<string, number>()
  private readonly diagnosticDelayer: Delayer<any>
  private pendingGetErr: GetErrRequest | undefined
  private readonly synchronizer: BufferSynchronizer
  private _validateJavaScript = true
  private _validateTypeScript = true

  private listening = false
  private readonly _onDelete = new Emitter<string>()
  public readonly onDelete: Event<string> = this._onDelete.event

  constructor(
    client: ITypeScriptServiceClient,
  ) {
    this.client = client
    this.synchronizer = new BufferSynchronizer(client)
    this.modeIds = new Set<string>(languageModeIds.languageIds)
    this.diagnosticDelayer = new Delayer<any>(300)
  }

  public listen(): void {
    if (this.listening) {
      return
    }
    this.listening = true
    workspace.onDidOpenTextDocument(
      this.onDidOpenTextDocument,
      this,
      this.disposables
    )
    workspace.onDidCloseTextDocument(
      this.onDidCloseTextDocument,
      this,
      this.disposables
    )
    workspace.onDidChangeTextDocument(
      this.onDidChangeTextDocument,
      this,
      this.disposables
    )
    workspace.textDocuments.forEach(this.onDidOpenTextDocument, this)
    this.updateConfiguration()
    workspace.onDidChangeConfiguration(this.updateConfiguration, this, this.disposables)
  }

  public dispose(): void {
    this.pendingDiagnostics.clear()
    disposeAll(this.disposables)
  }

  private onDidOpenTextDocument(document: TextDocument): void {
    if (!this.modeIds.has(document.languageId)) return
    let { uri } = document
    let filepath = this.client.toPath(uri)
    this.uris.add(uri)
    const args: Proto.OpenRequestArgs = {
      file: filepath,
      fileContent: document.getText()
    }

    if (this.client.apiVersion.gte(API.v203)) {
      const scriptKind = mode2ScriptKind(document.languageId)
      if (scriptKind) {
        args.scriptKindName = scriptKind
      }
    }
    if (this.client.apiVersion.gte(API.v230)) {
      let root = this.client.getProjectRootPath(document.uri)
      if (root) args.projectRootPath = root
    }
    this.synchronizer.open(args)
    // this.client.executeWithoutWaitingForResponse('open', args)
    this.requestDiagnostic(uri)
  }

  private onDidCloseTextDocument(document: TextDocument): void {
    let { uri } = document
    if (!this.uris.has(uri)) return
    let filepath = this.client.toPath(uri)
    this.uris.delete(uri)
    this.pendingDiagnostics.delete(uri)
    this.synchronizer.close(filepath)
    this._onDelete.fire(uri)
    this.requestAllDiagnostics()
    // this.client.executeWithoutWaitingForResponse('close', args)
  }

  private onDidChangeTextDocument(e: DidChangeTextDocumentParams): void {
    let { textDocument, contentChanges } = e
    let { uri } = textDocument
    if (!this.uris.has(uri)) return
    let filepath = this.client.toPath(uri)
    this.synchronizer.change(filepath, contentChanges)
    const didTrigger = this.requestDiagnostic(uri)
    if (!didTrigger && this.pendingGetErr) {
      // In this case we always want to re-trigger all diagnostics
      this.pendingGetErr.cancel()
      this.pendingGetErr = undefined
      this.triggerDiagnostics()
    }
  }

  public beforeCommand(command: string): void {
    this.synchronizer.beforeCommand(command)
  }

  public interuptGetErr<R>(f: () => R): R {
    if (!this.pendingGetErr) {
      return f()
    }

    this.pendingGetErr.cancel()
    this.pendingGetErr = undefined
    const result = f()
    this.triggerDiagnostics()
    return result
  }

  public getErr(resources: Uri[]): any {
    const handledResources = resources.filter(resource => this.uris.has(resource.toString()))
    if (!handledResources.length) {
      return
    }

    for (const resource of handledResources) {
      let uri = resource.toString()
      if (this.shouldValidate(uri)) {
        this.pendingDiagnostics.set(uri, Date.now())
      }
    }

    this.triggerDiagnostics()
  }

  public has(uri: string): boolean {
    return this.uris.has(uri)
  }

  private triggerDiagnostics(delay = 200): void {
    this.diagnosticDelayer.trigger(() => {
      this.sendPendingDiagnostics()
    }, delay)
  }

  public requestAllDiagnostics(): void {
    for (const uri of this.uris) {
      if (this.shouldValidate(uri)) {
        this.pendingDiagnostics.set(uri, Date.now())
      }
    }
    this.diagnosticDelayer.trigger(() => { // tslint:disable-line
      this.sendPendingDiagnostics()
    }, 200)
  }

  public requestDiagnostic(uri: string): boolean {
    let document = workspace.getDocument(uri)
    if (!document || !this.shouldValidate(uri)) return false
    this.pendingDiagnostics.set(uri, Date.now())
    const lineCount = document.lineCount
    const delay = Math.min(Math.max(Math.ceil(lineCount / 20), 300), 800)
    this.triggerDiagnostics(delay)
    return true
  }

  public hasPendingDiagnostics(uri: string): boolean {
    return this.pendingDiagnostics.has(uri)
  }

  private sendPendingDiagnostics(): void {
    const uris = Array.from(this.pendingDiagnostics.entries())
      .sort((a, b) => a[1] - b[1])
      .map(entry => entry[0])

    // Add all open TS buffers to the geterr request. They might be visible
    for (const uri of this.uris) {
      if (uris.indexOf(uri) == -1) {
        uris.push(uri)
      }
    }
    let files = uris.map(uri => this.client.toPath(uri))
    if (files.length) {
      if (this.pendingGetErr) this.pendingGetErr.cancel()
      const getErr = this.pendingGetErr = GetErrRequest.executeGetErrRequest(this.client, files, () => {
        if (this.pendingGetErr === getErr) {
          this.pendingGetErr = undefined
        }
      })
    }
    this.pendingDiagnostics.clear()
  }
  private updateConfiguration(): void {
    const jsConfig = workspace.getConfiguration('javascript', null)
    const tsConfig = workspace.getConfiguration('typescript', null)

    this._validateJavaScript = jsConfig.get<boolean>('validate.enable', true)
    this._validateTypeScript = tsConfig.get<boolean>('validate.enable', true)
  }

  public shouldValidate(uri: string): boolean {
    let doc = workspace.getDocument(uri)
    if (!doc) return false
    if (languageModeIds.languageIds.indexOf(doc.filetype) == -1) {
      return false
    }
    if (doc.filetype.startsWith('javascript')) {
      return this._validateJavaScript
    }
    return this._validateTypeScript
  }
}

class GetErrRequest {

  public static executeGetErrRequest(
    client: ITypeScriptServiceClient,
    files: string[],
    onDone: () => void
  ): GetErrRequest {
    const token = new CancellationTokenSource()
    return new GetErrRequest(client, files, token, onDone)
  }

  private _done = false

  private constructor(
    client: ITypeScriptServiceClient,
    public readonly files: string[],
    private readonly _token: CancellationTokenSource,
    onDone: () => void
  ) {
    const args: Proto.GeterrRequestArgs = {
      delay: 0,
      files: this.files
    }
    const done = () => {
      if (this._done) {
        return
      }
      this._done = true
      onDone()
    }

    client.executeAsync('geterr', args, _token.token).then(done, done)
  }

  public cancel(): any {
    if (!this._done) {
      this._token.cancel()
    }

    this._token.dispose()
  }
}
