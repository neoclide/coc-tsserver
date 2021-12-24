/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource, Disposable, disposeAll, Document, events, Position, Range, TextDocument, workspace } from 'coc.nvim'
import type * as Proto from '../protocol'
import { ITypeScriptServiceClient } from '../typescriptService'
import API from '../utils/api'
import FileConfigurationManager, { getInlayHintsPreferences } from './fileConfigurationManager'

export enum InlayHintKind {
  Other = 0,
  Type = 1,
  Parameter = 2
}

export interface InlayHint {
  text: string
  position: Position
  kind: InlayHintKind
  whitespaceBefore?: boolean
  whitespaceAfter?: boolean
}

export default class TypeScriptInlayHintsProvider implements Disposable {
  public static readonly minVersion = API.v440
  private readonly inlayHintsNS = workspace.createNameSpace('tsserver-inlay-hint')

  private _disposables: Disposable[] = []
  private _tokenSource: CancellationTokenSource | undefined = undefined
  private _inlayHints: Map<string, InlayHint[]> = new Map()

  public dispose() {
    if (this._tokenSource) {
      this._tokenSource.cancel()
      this._tokenSource.dispose()
      this._tokenSource = undefined
    }

    disposeAll(this._disposables)
    this._disposables = []
    this._inlayHints.clear()
  }

  constructor(private readonly client: ITypeScriptServiceClient, private readonly fileConfigurationManager: FileConfigurationManager) {
    events.on('InsertLeave', async bufnr => {
      const doc = workspace.getDocument(bufnr)
      await this.syncAndRenderHints(doc)
    }, this, this._disposables)

    workspace.onDidOpenTextDocument(async e => {
      const doc = workspace.getDocument(e.bufnr)
      await this.syncAndRenderHints(doc)
    }, this, this._disposables)

    workspace.onDidChangeTextDocument(async e => {
      const doc = workspace.getDocument(e.bufnr)
      await this.syncAndRenderHints(doc)
    }, this, this._disposables)

    this.syncAndRenderHints()
  }

  private async syncAndRenderHints(doc?: Document) {
    if (!doc) doc = await workspace.document
    if (!isESDocument(doc)) return

    if (this._tokenSource) {
      this._tokenSource.cancel()
      this._tokenSource.dispose()
    }

    try {
      this._tokenSource = new CancellationTokenSource()
      const { token } = this._tokenSource
      const range = Range.create(0, 0, doc.lineCount, doc.getline(doc.lineCount).length)
      const hints = await this.provideInlayHints(doc.textDocument, range, token)
      if (token.isCancellationRequested) return

      await this.renderHints(doc, hints)
    } catch (e) {
      console.error(e)
      this._tokenSource.cancel()
      this._tokenSource.dispose()
    }
  }

  private async renderHints(doc: Document, hints: InlayHint[]) {
    this._inlayHints.set(doc.uri, hints)

    const chaining_hints = {}
    for (const item of hints) {
      const chunks: [[string, string]] = [[item.text, 'CocHintSign']]
      if (chaining_hints[item.position.line] === undefined) {
        chaining_hints[item.position.line] = chunks
      } else {
        chaining_hints[item.position.line].push([' ', 'Normal'])
        chaining_hints[item.position.line].push(chunks[0])
      }
    }

    doc.buffer.clearNamespace(this.inlayHintsNS)
    Object.keys(chaining_hints).forEach(async (line) => {
      await doc.buffer.setVirtualText(this.inlayHintsNS, Number(line), chaining_hints[line], {})
    })
  }

  private inlayHintsEnabled(language: string) {
    const preferences = getInlayHintsPreferences(language)
    return preferences.includeInlayParameterNameHints === 'literals'
      || preferences.includeInlayParameterNameHints === 'all'
      || preferences.includeInlayEnumMemberValueHints
      || preferences.includeInlayFunctionLikeReturnTypeHints
      || preferences.includeInlayFunctionParameterTypeHints
      || preferences.includeInlayPropertyDeclarationTypeHints
      || preferences.includeInlayVariableTypeHints
  }

  async provideInlayHints(document: TextDocument, range: Range, token: CancellationToken): Promise<InlayHint[]> {
    if (!this.inlayHintsEnabled(document.languageId)) return []

    const filepath = this.client.toOpenedFilePath(document.uri)
    if (!filepath) return []

    const start = document.offsetAt(range.start)
    const length = document.offsetAt(range.end) - start

    await this.fileConfigurationManager.ensureConfigurationForDocument(document, token)

    const response = await this.client.execute('provideInlayHints', { file: filepath, start, length }, token)
    if (response.type !== 'response' || !response.success || !response.body) {
      return []
    }

    return response.body.map(hint => {
      return {
        text: hint.text,
        position: Position.create(hint.position.line - 1, hint.position.offset - 1),
        kind: hint.kind && fromProtocolInlayHintKind(hint.kind),
        whitespaceAfter: hint.whitespaceAfter,
        whitespaceBefore: hint.whitespaceBefore,
      }
    })
  }
}

function isESDocument(doc: Document) {
  if (!doc || !doc.attached) return false
  return doc.filetype === 'typescript' || doc.filetype === 'javascript'
}

function fromProtocolInlayHintKind(kind: Proto.InlayHintKind): InlayHintKind {
  switch (kind) {
    case 'Parameter': return InlayHintKind.Parameter
    case 'Type': return InlayHintKind.Type
    case 'Enum': return InlayHintKind.Other
    default: return InlayHintKind.Other
  }
}
