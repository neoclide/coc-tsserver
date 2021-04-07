/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationTokenSource, Disposable, disposeAll, Position, Range, snippetManager, window, workspace } from 'coc.nvim'
import { TextDocumentContentChangeEvent } from 'vscode-languageserver-protocol'
import * as Proto from '../protocol'
import { ITypeScriptServiceClient } from '../typescriptService'
import API from '../utils/api'
import SnippetString from '../utils/SnippetString'
import * as typeConverters from '../utils/typeConverters'

export default class TagClosing implements Disposable {
  public static readonly minVersion = API.v300

  private static _configurationLanguages: Record<string, string> = {
    'javascriptreact': 'javascript',
    'typescriptreact': 'typescript',
  }

  private _disposables: Disposable[] = []
  private _enabled: boolean = false
  private _disposed = false
  private _timeout: NodeJS.Timer | undefined = undefined
  private _cancel: CancellationTokenSource | undefined = undefined

  constructor(
    private readonly client: ITypeScriptServiceClient,
    private readonly descriptionLanguageId: string
  ) {
    workspace.onDidChangeTextDocument(
      (event) =>
        this.onDidChangeTextDocument(
          event.textDocument,
          event.contentChanges
        ),
      null,
      this._disposables
    )

    this.updateEnabledState()

    workspace.registerAutocmd({
      event: ['BufEnter'],
      request: false,
      callback: () => this.updateEnabledState(),
    })
  }

  async updateEnabledState(): Promise<void> {
    this._enabled = false
    const doc = await workspace.document
    if (!doc) {
      return
    }
    const document = doc.textDocument
    const configLang = TagClosing._configurationLanguages[document.languageId]
    if (!configLang || configLang !== this.descriptionLanguageId) {
      return
    }
    if (!workspace.getConfiguration(undefined, document.uri).get<boolean>(`${configLang}.autoClosingTags`)) {
      return
    }
    this._enabled = true
  }

  public dispose() {
    this._disposed = true

    if (this._timeout) {
      clearTimeout(this._timeout)
      this._timeout = undefined
    }

    if (this._cancel) {
      this._cancel.cancel()
      this._cancel.dispose()
      this._cancel = undefined
    }

    disposeAll(this._disposables)
    this._disposables = []
  }

  private async onDidChangeTextDocument(
    documentEvent: {
      uri: string,
      version: number,
    },
    changes: readonly TextDocumentContentChangeEvent[]
  ) {
    if (!this._enabled) {
      return
    }
    const document = await workspace.document
    if (!document) {
      return
    }
    const activeDocument = document.textDocument
    if (activeDocument.uri !== documentEvent.uri || changes.length === 0) {
      return
    }
    const filepath = this.client.toOpenedFilePath(documentEvent.uri)
    if (!filepath) {
      return
    }

    if (typeof this._timeout !== 'undefined') {
      clearTimeout(this._timeout)
    }

    if (this._cancel) {
      this._cancel.cancel()
      this._cancel.dispose()
      this._cancel = undefined
    }

    const lastChange = changes[changes.length - 1]
    if (!Range.is(lastChange['range']) || !lastChange.text) {
      return
    }

    const lastCharacter = lastChange.text[lastChange.text.length - 1]
    if (lastCharacter !== '>' && lastCharacter !== '/') {
      return
    }

    const version = documentEvent.version

    const rangeStart = lastChange['range'].start
    const priorCharacter =
      lastChange['range'].start.character > 0
        ? activeDocument.getText(
          Range.create(
            Position.create(rangeStart.line, rangeStart.character - 1),
            rangeStart
          )
        )
        : ''
    if (priorCharacter === '>') {
      return
    }

    this._timeout = setTimeout(async () => {
      this._timeout = undefined

      if (this._disposed) {
        return
      }

      const addedLines = lastChange.text.split(/\r\n|\n/g)
      const position =
        addedLines.length <= 1
          ? Position.create(
            rangeStart.line,
            rangeStart.character + lastChange.text.length
          )
          : Position.create(
            rangeStart.line + addedLines.length - 1,
            addedLines[addedLines.length - 1].length
          )

      const args: Proto.JsxClosingTagRequestArgs = typeConverters.Position.toFileLocationRequestArgs(
        filepath,
        position
      )
      this._cancel = new CancellationTokenSource()
      const response = await this.client.execute(
        'jsxClosingTag',
        args,
        this._cancel.token
      )
      if (response.type !== 'response' || !response.body) {
        return
      }

      if (this._disposed) {
        return
      }

      const insertion = response.body;
      if (
        documentEvent.uri === activeDocument.uri &&
        activeDocument.version === version
      ) {
        snippetManager.insertSnippet(
          this.getTagSnippet(insertion).value,
          false,
          Range.create(position, position)
        )
      }
    }, 100);
  }

  private getTagSnippet(closingTag: Proto.TextInsertion): SnippetString {
    const snippet = new SnippetString();
    snippet.appendPlaceholder('', 0);
    snippet.appendText(closingTag.newText);
    return snippet;
  }
}
