/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { workspace } from 'coc.nvim'
import { CompletionItem, CompletionItemKind, InsertTextFormat, Position, TextEdit } from 'vscode-languageserver-protocol'
import * as Proto from '../protocol'
import * as PConst from '../protocol.const'

interface CommitCharactersSettings {
  readonly isNewIdentifierLocation: boolean
  readonly isInValidCommitCharacterContext: boolean
  readonly useCodeSnippetsOnMethodSuggest: boolean
}

export function convertCompletionEntry(
  tsEntry: Proto.CompletionEntry,
  uri: string,
  position: Position,
  useCodeSnippetsOnMethodSuggest: boolean,
  isNewIdentifierLocation: boolean
): CompletionItem {
  let label = tsEntry.name
  let sortText = tsEntry.sortText
  if (tsEntry.isRecommended) {
    // Make sure isRecommended property always comes first
    // https://github.com/Microsoft/vscode/issues/40325
    sortText = '\0' + sortText
  } else if (tsEntry.source) {
    // De-prioritze auto-imports
    // https://github.com/Microsoft/vscode/issues/40311
    sortText = '\uffff' + sortText
  } else {
    sortText = tsEntry.sortText
  }
  let kind = convertKind(tsEntry.kind)
  let insertTextFormat = (
    useCodeSnippetsOnMethodSuggest &&
    (kind === CompletionItemKind.Function ||
      kind === CompletionItemKind.Method)
  ) ? InsertTextFormat.Snippet : InsertTextFormat.PlainText

  let insertText = tsEntry.insertText
  let document = workspace.getDocument(uri)
  let preText = document.getline(position.line).slice(0, position.character)
  const isInValidCommitCharacterContext = preText.match(/(^|[a-z_$\(\)\[\]\{\}]|[^.]\.)\s*$/ig) !== null

  let commitCharacters = getCommitCharacters(tsEntry, { isNewIdentifierLocation, isInValidCommitCharacterContext, useCodeSnippetsOnMethodSuggest })
  let optional = tsEntry.kindModifiers && tsEntry.kindModifiers.match(/\boptional\b/)
  return {
    label,
    insertText,
    kind,
    insertTextFormat,
    sortText,
    commitCharacters,
    data: {
      uri,
      optional,
      position,
      source: tsEntry.source || ''
    }
  }
}

function convertKind(kind: string): CompletionItemKind {
  switch (kind) {
    case PConst.Kind.primitiveType:
    case PConst.Kind.keyword:
      return CompletionItemKind.Keyword
    case PConst.Kind.const:
      return CompletionItemKind.Constant
    case PConst.Kind.let:
    case PConst.Kind.variable:
    case PConst.Kind.localVariable:
    case PConst.Kind.alias:
      return CompletionItemKind.Variable
    case PConst.Kind.memberVariable:
    case PConst.Kind.memberGetAccessor:
    case PConst.Kind.memberSetAccessor:
      return CompletionItemKind.Field
    case PConst.Kind.function:
      return CompletionItemKind.Function
    case PConst.Kind.memberFunction:
    case PConst.Kind.constructSignature:
    case PConst.Kind.callSignature:
    case PConst.Kind.indexSignature:
      return CompletionItemKind.Method
    case PConst.Kind.enum:
      return CompletionItemKind.Enum
    case PConst.Kind.module:
    case PConst.Kind.externalModuleName:
      return CompletionItemKind.Module
    case PConst.Kind.class:
    case PConst.Kind.type:
      return CompletionItemKind.Class
    case PConst.Kind.interface:
      return CompletionItemKind.Interface
    case PConst.Kind.warning:
    case PConst.Kind.file:
    case PConst.Kind.script:
      return CompletionItemKind.File
    case PConst.Kind.directory:
      return CompletionItemKind.Folder
  }
  return CompletionItemKind.Variable
}

function getCommitCharacters(tsEntry: Proto.CompletionEntry, settings: CommitCharactersSettings): string[] | undefined {
  if (settings.isNewIdentifierLocation || !settings.isInValidCommitCharacterContext) {
    return undefined
  }
  const commitCharacters: string[] = []
  switch (tsEntry.kind) {
    case PConst.Kind.memberGetAccessor:
    case PConst.Kind.memberSetAccessor:
    case PConst.Kind.constructSignature:
    case PConst.Kind.callSignature:
    case PConst.Kind.indexSignature:
    case PConst.Kind.enum:
    case PConst.Kind.interface:
      commitCharacters.push('.', ';')
      break
    case PConst.Kind.module:
    case PConst.Kind.alias:
    case PConst.Kind.const:
    case PConst.Kind.let:
    case PConst.Kind.variable:
    case PConst.Kind.localVariable:
    case PConst.Kind.memberVariable:
    case PConst.Kind.class:
    case PConst.Kind.function:
    case PConst.Kind.memberFunction:
    case PConst.Kind.keyword:
      commitCharacters.push('.', ',', ';')
      if (settings.useCodeSnippetsOnMethodSuggest) {
        commitCharacters.push('(')
      }
      break
  }
  return commitCharacters.length === 0 ? undefined : commitCharacters
}
