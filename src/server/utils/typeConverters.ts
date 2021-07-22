/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Helpers for converting FROM LanguageServer types language-server ts types
 */
import * as language from 'vscode-languageserver-protocol'
import Proto from '../protocol'
import * as PConst from '../protocol.const'
import { ITypeScriptServiceClient } from '../typescriptService'

export namespace Range {
  export const fromTextSpan = (span: Proto.TextSpan): language.Range => {
    return {
      start: {
        line: span.start.line - 1,
        character: span.start.offset - 1
      },
      end: {
        line: span.end.line - 1,
        character: span.end.offset - 1
      }
    }
  }
  export const fromLocations = (start: Proto.Location, end: Proto.Location): language.Range =>
    language.Range.create(
      Math.max(0, start.line - 1), Math.max(start.offset - 1, 0),
      Math.max(0, end.line - 1), Math.max(0, end.offset - 1))


  export const toFormattingRequestArgs = (file: string, range: language.Range): Proto.FormatRequestArgs => ({
    file,
    line: range.start.line + 1,
    offset: range.start.character + 1,
    endLine: range.end.line + 1,
    endOffset: range.end.character + 1
  })

  export const toFileRangeRequestArgs = (
    file: string,
    range: language.Range
  ): Proto.FileRangeRequestArgs => ({
    file,
    startLine: range.start.line + 1,
    startOffset: range.start.character + 1,
    endLine: range.end.line + 1,
    endOffset: range.end.character + 1
  })
}

export namespace Position {
  export const fromLocation = (tslocation: Proto.Location): language.Position => {
    return {
      line: tslocation.line - 1,
      character: tslocation.offset - 1
    }
  }

  export const toLocation = (position: language.Position): Proto.Location => ({
    line: position.line + 1,
    offset: position.character + 1,
  })

  export const toFileLocationRequestArgs = (
    file: string,
    position: language.Position
  ): Proto.FileLocationRequestArgs => ({
    file,
    line: position.line + 1,
    offset: position.character + 1
  })
}

export namespace Location {
  export const fromTextSpan = (
    uri: string,
    tsTextSpan: Proto.TextSpan
  ): language.Location => {
    return {
      uri,
      range: Range.fromTextSpan(tsTextSpan)
    }
  }
}

export namespace TextEdit {
  export const fromCodeEdit = (edit: Proto.CodeEdit): language.TextEdit => {
    return {
      range: Range.fromTextSpan(edit),
      newText: edit.newText
    }
  }
}

export namespace WorkspaceEdit {
  export function fromFileCodeEdits(
    client: ITypeScriptServiceClient,
    edits: Iterable<Proto.FileCodeEdits>
  ): language.WorkspaceEdit {
    let changes = {}
    for (const edit of edits) {
      let uri = client.toResource(edit.fileName)
      changes[uri] = edit.textChanges.map(change => {
        return TextEdit.fromCodeEdit(change)
      })
    }
    return { changes }
  }
}

export namespace SymbolKind {
  export function fromProtocolScriptElementKind(kind: Proto.ScriptElementKind) {
    switch (kind) {
      case PConst.Kind.module: return language.SymbolKind.Module
      case PConst.Kind.class: return language.SymbolKind.Class
      case PConst.Kind.enum: return language.SymbolKind.Enum
      case PConst.Kind.enumMember: return language.SymbolKind.EnumMember
      case PConst.Kind.interface: return language.SymbolKind.Interface
      case PConst.Kind.indexSignature: return language.SymbolKind.Method
      case PConst.Kind.callSignature: return language.SymbolKind.Method
      case PConst.Kind.method: return language.SymbolKind.Method
      case PConst.Kind.memberVariable: return language.SymbolKind.Property
      case PConst.Kind.memberGetAccessor: return language.SymbolKind.Property
      case PConst.Kind.memberSetAccessor: return language.SymbolKind.Property
      case PConst.Kind.variable: return language.SymbolKind.Variable
      case PConst.Kind.let: return language.SymbolKind.Variable
      case PConst.Kind.const: return language.SymbolKind.Variable
      case PConst.Kind.localVariable: return language.SymbolKind.Variable
      case PConst.Kind.alias: return language.SymbolKind.Variable
      case PConst.Kind.function: return language.SymbolKind.Function
      case PConst.Kind.localFunction: return language.SymbolKind.Function
      case PConst.Kind.constructSignature: return language.SymbolKind.Constructor
      case PConst.Kind.constructorImplementation: return language.SymbolKind.Constructor
      case PConst.Kind.typeParameter: return language.SymbolKind.TypeParameter
      case PConst.Kind.string: return language.SymbolKind.String
      default: return language.SymbolKind.Variable
    }
  }
}
