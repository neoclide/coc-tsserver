/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { CancellationToken, Disposable, disposeAll, Emitter, Event, InlayHint, InlayHintKind, InlayHintsProvider, Range, TextDocument, workspace } from 'coc.nvim'
import type * as Proto from '../protocol'
import { ITypeScriptServiceClient } from '../typescriptService'
import API from '../utils/api'
import { LanguageDescription } from '../utils/languageDescription'
import * as typeConverters from '../utils/typeConverters'
import FileConfigurationManager, { getInlayHintsPreferences } from './fileConfigurationManager'

export default class TypeScriptInlayHintsProvider implements InlayHintsProvider {
  public static readonly minVersion = API.v440
  private disposables: Disposable[] = []
  private readonly _onDidChangeInlayHints = new Emitter<void>()
  public readonly onDidChangeInlayHints: Event<void> = this._onDidChangeInlayHints.event

  constructor(
    private readonly language: LanguageDescription,
    private readonly client: ITypeScriptServiceClient,
    private readonly fileConfigurationManager: FileConfigurationManager,
  ) {
    let section = `${language.id}.inlayHints`
    workspace.onDidChangeConfiguration(async e => {
      if (e.affectsConfiguration(section)) {
        this._onDidChangeInlayHints.fire()
      }
    }, null, this.disposables)
    // When a JS/TS file changes, change inlay hints for all visible editors
    // since changes in one file can effect the hints the others.
    workspace.onDidChangeTextDocument(e => {
      let doc = workspace.getDocument(e.textDocument.uri)
      if (language.languageIds.includes(doc.languageId)) {
        this._onDidChangeInlayHints.fire()
      }
    }, null, this.disposables)
  }

  public dispose(): void {
    this._onDidChangeInlayHints.dispose()
    disposeAll(this.disposables)
  }

  async provideInlayHints(document: TextDocument, range: Range, token: CancellationToken): Promise<InlayHint[]> {
    const filepath = this.client.toOpenedFilePath(document.uri)
    if (!filepath) return []

    if (!areInlayHintsEnabledForFile(this.language, document)) {
      return []
    }
    const start = document.offsetAt(range.start)
    const length = document.offsetAt(range.end) - start
    await this.fileConfigurationManager.ensureConfigurationForDocument(document, token)
    const response = await this.client.execute('provideInlayHints', { file: filepath, start, length }, token)
    if (response.type !== 'response' || !response.success || !response.body) {
      return []
    }

    return response.body.map(hint => {
      return {
        label: hint.text,
        position: typeConverters.Position.fromLocation(hint.position),
        kind: fromProtocolInlayHintKind(hint.kind),
        paddingLeft: hint.whitespaceBefore,
        paddingRight: hint.whitespaceAfter,
      }
    })
  }
}

function fromProtocolInlayHintKind(kind: Proto.InlayHintKind): InlayHintKind {
  switch (kind) {
    case 'Parameter': return 2
    case 'Type': return 1
    case 'Enum': return undefined
    default: return undefined
  }
}

function areInlayHintsEnabledForFile(language: LanguageDescription, document: TextDocument) {
  const config = workspace.getConfiguration(language.id, document.uri)
  const preferences = getInlayHintsPreferences(config)
  return preferences.includeInlayParameterNameHints === 'literals' ||
    preferences.includeInlayParameterNameHints === 'all' ||
    preferences.includeInlayEnumMemberValueHints ||
    preferences.includeInlayFunctionLikeReturnTypeHints ||
    preferences.includeInlayFunctionParameterTypeHints ||
    preferences.includeInlayPropertyDeclarationTypeHints ||
    preferences.includeInlayVariableTypeHints
}
