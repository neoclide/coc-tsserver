/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationTokenSource, window, Disposable, disposeAll, Position, Range, snippetManager, events, workspace, InsertChange, TextEditor } from 'coc.nvim'
import * as Proto from '../protocol'
import { ITypeScriptServiceClient } from '../typescriptService'
import SnippetString from '../utils/SnippetString'
import * as typeConverters from '../utils/typeConverters'

export default class TagClosing implements Disposable {
  private static _configurationLanguages: Record<string, string> = {
    'javascriptreact': 'javascript',
    'typescriptreact': 'typescript',
  }

  private _disposables: Disposable[] = []
  private _disposed = false
  private _timeout: NodeJS.Timer | undefined = undefined
  private _cancel: CancellationTokenSource | undefined = undefined
  private _enable = true

  constructor(
    private readonly client: ITypeScriptServiceClient,
    private readonly descriptionLanguageId: string
  ) {
    this.checkConfig(window.activeTextEditor)
    events.on('TextInsert', this.onInsertChange, this, this._disposables)
    window.onDidChangeActiveTextEditor(e => {
      this.checkConfig(e)
    }, null, this._disposables)
  }

  private checkConfig(editor: TextEditor | undefined): void {
    if (!editor) return
    let { languageId, uri } = editor.document
    let id = TagClosing._configurationLanguages[languageId]
    if (!id || id !== this.descriptionLanguageId) {
      this._enable = false
      return
    }
    this._enable = workspace.getConfiguration(undefined, uri).get<boolean>(`${id}.autoClosingTags`, true)
  }

  private async onInsertChange(bufnr: number, change: InsertChange, lastInsert: string): Promise<void> {
    let doc = workspace.getDocument((bufnr))
    if (!doc || !doc.attached) return
    let enabled = this.isEnabled(doc.filetype)
    if (!enabled) return
    let { pre, changedtick, lnum } = change
    if (lastInsert !== '/' && lastInsert != '>') return
    if (pre.length > 1 && pre[pre.length - 2] == '>') return
    const filepath = this.client.toOpenedFilePath(doc.uri)
    if (!filepath) return
    if (this._timeout) {
      clearTimeout(this._timeout)
    }
    if (this._cancel) {
      this._cancel.cancel()
      this._cancel.dispose()
      this._cancel = undefined
    }
    await (doc as any).patchChange()
    this._timeout = setTimeout(async () => {
      this._timeout = undefined
      if (this._disposed) return
      if (doc.changedtick > changedtick) return
      const position = Position.create(lnum - 1, pre.length)
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
      if (this._disposed) return
      const insertion = response.body
      if (doc.changedtick === changedtick) {
        snippetManager.insertSnippet(
          this.getTagSnippet(insertion).value,
          false,
          Range.create(position, position)
        )
      }
    }, 30)
  }

  private isEnabled(languageId: string): boolean {
    const configLang = TagClosing._configurationLanguages[languageId]
    if (!configLang || configLang !== this.descriptionLanguageId) {
      return false
    }
    if (!this._enable) {
      return false
    }
    return true
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

  private getTagSnippet(closingTag: Proto.TextInsertion): SnippetString {
    const snippet = new SnippetString()
    snippet.appendPlaceholder('', 0)
    snippet.appendText(closingTag.newText)
    return snippet
  }
}
