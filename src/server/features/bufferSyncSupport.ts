/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { disposeAll, workspace } from 'coc.nvim'
import { CancellationTokenSource, DidChangeTextDocumentParams, Disposable, TextDocument } from 'vscode-languageserver-protocol'
import Proto from '../protocol'
import { ITypeScriptServiceClient } from '../typescriptService'
import API from '../utils/api'
import { Delayer } from '../utils/async'
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

export default class BufferSyncSupport {
  private readonly client: ITypeScriptServiceClient

  private _validate: boolean
  private readonly modeIds: Set<string>
  private readonly uris: Set<string> = new Set()
  private readonly disposables: Disposable[] = []

  private readonly pendingDiagnostics = new Map<string, number>()
  private readonly diagnosticDelayer: Delayer<any>
  private pendingGetErr: GetErrRequest | undefined

  constructor(
    client: ITypeScriptServiceClient,
    modeIds: string[],
    validate: boolean
  ) {
    this.client = client
    this.modeIds = new Set<string>(modeIds)
    this._validate = validate || false
    this.diagnosticDelayer = new Delayer<any>(300)
  }

  public listen(): void {
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
  }

  public reInitialize(): void {
    workspace.textDocuments.forEach(this.onDidOpenTextDocument, this)
  }

  public set validate(value: boolean) {
    this._validate = value
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

    this.client.executeWithoutWaitingForResponse('open', args) // tslint:disable-line
    this.requestDiagnostic(uri)
  }

  private onDidCloseTextDocument(document: TextDocument): void {
    let { uri } = document
    if (!this.uris.has(uri)) return
    let filepath = this.client.toPath(uri)
    const args: Proto.FileRequestArgs = {
      file: filepath
    }
    this.client.executeWithoutWaitingForResponse('close', args) // tslint:disable-line
  }

  private onDidChangeTextDocument(e: DidChangeTextDocumentParams): void {
    let { textDocument, contentChanges } = e
    let { uri } = textDocument
    if (!this.uris.has(uri)) return
    let filepath = this.client.toPath(uri)
    for (const { range, text } of contentChanges) {
      const args: Proto.ChangeRequestArgs = {
        file: filepath,
        line: range ? range.start.line + 1 : 1,
        offset: range ? range.start.character + 1 : 1,
        endLine: range ? range.end.line + 1 : 2 ** 24,
        endOffset: range ? range.end.character + 1 : 1,
        insertString: text
      }
      this.client.executeWithoutWaitingForResponse('change', args) // tslint:disable-line
    }
    const didTrigger = this.requestDiagnostic(uri)
    if (!didTrigger && this.pendingGetErr) {
      // In this case we always want to re-trigger all diagnostics
      this.pendingGetErr.cancel()
      this.pendingGetErr = undefined
      this.triggerDiagnostics()
    }
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

  private triggerDiagnostics(delay = 200): void {
    this.diagnosticDelayer.trigger(() => {
      this.sendPendingDiagnostics()
    }, delay)
  }

  public requestAllDiagnostics(): void {
    if (!this._validate) {
      return
    }
    for (const uri of this.uris) {
      this.pendingDiagnostics.set(uri, Date.now())
    }
    this.diagnosticDelayer.trigger(() => { // tslint:disable-line
      this.sendPendingDiagnostics()
    }, 200)
  }

  public requestDiagnostic(uri: string): boolean {
    if (!this._validate) {
      return false
    }
    let document = workspace.getDocument(uri)
    if (!document) return false
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
    if (!this._validate) {
      return
    }
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
