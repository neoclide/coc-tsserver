/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Range, CompletionItem, CompletionItemKind, InsertTextFormat, Position, TextEdit } from 'vscode-languageserver-protocol'
import * as Proto from '../protocol'
import * as PConst from '../protocol.const'

interface ParamterListParts {
  readonly parts: ReadonlyArray<Proto.SymbolDisplayPart>
  readonly hasOptionalParameters: boolean
}

export interface DotAccessorContext {
  readonly range: Range
  readonly text: string
}

export interface CompletionContext {
  readonly isNewIdentifierLocation: boolean
  readonly isMemberCompletion: boolean
  readonly isInValidCommitCharacterContext: boolean
  readonly enableCallCompletions: boolean
  readonly dotAccessorContext?: DotAccessorContext
}

export function convertCompletionEntry(
  tsEntry: Proto.CompletionEntry,
  uri: string,
  position: Position,
  context: CompletionContext,
): CompletionItem {
  let label = tsEntry.name
  let sortText = tsEntry.sortText
  let preselect = false
  let detail: string
  if (tsEntry.isRecommended) {
    preselect = true
  }
  if (tsEntry.source) {
    // De-prioritze auto-imports https://github.com/Microsoft/vscode/issues/40311
    sortText = '\uffff' + sortText
  } else {
    sortText = tsEntry.sortText
  }
  let kind = convertKind(tsEntry.kind)
  let insertTextFormat = (
    context.enableCallCompletions &&
    (kind === CompletionItemKind.Function ||
      kind === CompletionItemKind.Method)
  ) ? InsertTextFormat.Snippet : InsertTextFormat.PlainText

  let insertText = tsEntry.insertText
  let commitCharacters = getCommitCharacters(tsEntry, context)

  let textEdit: TextEdit | null = null
  if (tsEntry.replacementSpan) {
    let { start, end } = tsEntry.replacementSpan
    if (start.line == end.line) {
      textEdit = {
        range: Range.create(start.line - 1, start.offset - 1, end.line - 1, end.offset - 1),
        newText: insertText || label
      }
    }
  }
  if (tsEntry.kindModifiers) {
    const kindModifiers = new Set(tsEntry.kindModifiers.split(/,|\s+/g))
    if (kindModifiers.has(PConst.KindModifiers.optional)) {
      insertText = label
      label += '?'
    }

    if (kindModifiers.has(PConst.KindModifiers.color)) {
      kind = CompletionItemKind.Color
    }

    if (tsEntry.kind === PConst.Kind.script) {
      for (const extModifier of PConst.KindModifiers.fileExtensionKindModifiers) {
        if (kindModifiers.has(extModifier)) {
          if (tsEntry.name.toLowerCase().endsWith(extModifier)) {
            detail = tsEntry.name
          } else {
            detail = tsEntry.name + extModifier
          }
          break
        }
      }
    }
  }
  return {
    label,
    insertText,
    textEdit,
    kind,
    preselect,
    insertTextFormat,
    sortText,
    commitCharacters,
    detail,
    data: {
      uri,
      position,
      name: tsEntry.name,
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
    case PConst.Kind.method:
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
    case PConst.Kind.script:
      return CompletionItemKind.File
    case PConst.Kind.directory:
      return CompletionItemKind.Folder
  }
  return CompletionItemKind.Variable
}

function getCommitCharacters(tsEntry: Proto.CompletionEntry, context: CompletionContext): string[] | undefined {
  if (context.isNewIdentifierLocation || !context.isInValidCommitCharacterContext) {
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
    case PConst.Kind.method:
    case PConst.Kind.keyword:
    case PConst.Kind.parameter:
      commitCharacters.push('.', ',', ';')
      if (context.enableCallCompletions) {
        commitCharacters.push('(')
      }
      break
  }
  return commitCharacters.length === 0 ? undefined : commitCharacters
}

export function getParameterListParts(
  displayParts: ReadonlyArray<Proto.SymbolDisplayPart>
): ParamterListParts {
  const parts: Proto.SymbolDisplayPart[] = []
  let isInMethod = false
  let hasOptionalParameters = false
  let parenCount = 0
  let braceCount = 0

  outer: for (let i = 0; i < displayParts.length; ++i) {
    const part = displayParts[i]
    switch (part.kind) {
      case PConst.DisplayPartKind.methodName:
      case PConst.DisplayPartKind.functionName:
      case PConst.DisplayPartKind.text:
      case PConst.DisplayPartKind.propertyName:
        if (parenCount === 0 && braceCount === 0) {
          isInMethod = true
        }
        break

      case PConst.DisplayPartKind.parameterName:
        if (parenCount === 1 && braceCount === 0 && isInMethod) {
          // Only take top level paren names
          const next = displayParts[i + 1]
          // Skip optional parameters
          const nameIsFollowedByOptionalIndicator = next && next.text === '?'
          // Skip this parameter
          const nameIsThis = part.text === 'this'
          if (!nameIsFollowedByOptionalIndicator && !nameIsThis) {
            parts.push(part)
          }
          hasOptionalParameters = hasOptionalParameters || nameIsFollowedByOptionalIndicator
        }
        break

      case PConst.DisplayPartKind.punctuation:
        if (part.text === '(') {
          ++parenCount
        } else if (part.text === ')') {
          --parenCount
          if (parenCount <= 0 && isInMethod) {
            break outer
          }
        } else if (part.text === '...' && parenCount === 1) {
          // Found rest parmeter. Do not fill in any further arguments
          hasOptionalParameters = true
          break outer
        } else if (part.text === '{') {
          ++braceCount
        } else if (part.text === '}') {
          --braceCount
        }
        break
    }
  }
  return { hasOptionalParameters, parts }
}
