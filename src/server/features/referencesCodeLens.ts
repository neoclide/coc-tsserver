/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken, Position, Range } from 'vscode-languageserver-protocol'
import { TextDocument, workspace, CodeLens } from 'coc.nvim'
import { ExecutionTarget } from '../typescriptService'
import * as Proto from '../protocol'
import * as PConst from '../protocol.const'
import * as typeConverters from '../utils/typeConverters'
import { TypeScriptBaseCodeLensProvider, getSymbolRange } from './baseCodeLensProvider'

export default class TypeScriptReferencesCodeLensProvider extends TypeScriptBaseCodeLensProvider {
  public async resolveCodeLens(
    codeLens: CodeLens,
    token: CancellationToken
  ): Promise<CodeLens> {
    let { uri } = codeLens.data
    let filepath = this.client.toPath(uri)
    const args = typeConverters.Position.toFileLocationRequestArgs(
      filepath,
      codeLens.range.start
    )
    let response = await this.client.execute('references', args, token, {
      lowPriority: true,
      executionTarget: ExecutionTarget.Semantic
    })
    if (!response || response.type != 'response' || !response.body) {
      codeLens.command = {
        title: response.type === 'cancelled'
          ? ''
          : 'could not determine references',
        command: ''
      }
      return codeLens
    }

    const locations = response.body.refs
      .filter(reference => !reference.isDefinition)
      .map(reference =>
        typeConverters.Location.fromTextSpan(
          this.client.toResource(reference.file),
          reference
        )
      )

    codeLens.command = {
      title: locations.length === 1 ? '1 reference' : `${locations.length} references`,
      command: locations.length ? 'editor.action.showReferences' : '',
      arguments: [uri, codeLens.range.start, locations]
    }
    return codeLens
  }

  protected extractSymbol(
    document: TextDocument,
    item: Proto.NavigationTree,
    parent: Proto.NavigationTree | null
  ): Range | null {
    if (parent && parent.kind === PConst.Kind.enum) {
      return getSymbolRange(document, item)
    }

    switch (item.kind) {
      case PConst.Kind.function: {
        const showOnAllFunctions = workspace.getConfiguration(this.modeId).get<boolean>('referencesCodeLens.showOnAllFunctions')
        if (showOnAllFunctions) {
          return getSymbolRange(document, item)
        }
      }
      // fallthrough

      case PConst.Kind.const:
      case PConst.Kind.let:
      case PConst.Kind.variable:
        // Only show references for exported variables
        if (/\bexport\b/.test(item.kindModifiers)) {
          return getSymbolRange(document, item)
        }
        break

      case PConst.Kind.class:
        if (item.text === '<class>') {
          break
        }
        return getSymbolRange(document, item)

      case PConst.Kind.interface:
      case PConst.Kind.type:
      case PConst.Kind.enum:
        return getSymbolRange(document, item)

      case PConst.Kind.method:
      case PConst.Kind.memberGetAccessor:
      case PConst.Kind.memberSetAccessor:
      case PConst.Kind.constructorImplementation:
      case PConst.Kind.memberVariable:
        // Don't show if child and parent have same start
        // For https://github.com/microsoft/vscode/issues/90396
        if (parent &&
          comparePosition(typeConverters.Position.fromLocation(parent.spans[0].start), typeConverters.Position.fromLocation(item.spans[0].start)) == 0
        ) {
          return null
        }

        // Only show if parent is a class type object (not a literal)
        switch (parent?.kind) {
          case PConst.Kind.class:
          case PConst.Kind.interface:
          case PConst.Kind.type:
            return getSymbolRange(document, item)
        }
        break
    }

    return null
  }
}

export function comparePosition(position: Position, other: Position): number {
  if (position.line > other.line) return 1
  if (other.line == position.line && position.character > other.character) return 1
  if (other.line == position.line && position.character == other.character) return 0
  return -1
}
