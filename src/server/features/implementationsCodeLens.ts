/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken, CodeLens, Command, Location, Range } from 'vscode-languageserver-protocol'
import { TextDocument, workspace } from 'coc.nvim'
import * as Proto from '../protocol'
import * as PConst from '../protocol.const'
import * as typeConverters from '../utils/typeConverters'
import { TypeScriptBaseCodeLensProvider, getSymbolRange } from './baseCodeLensProvider'

export default class TypeScriptImplementationsCodeLensProvider extends TypeScriptBaseCodeLensProvider {
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
    const response = await this.client.execute('implementation', args, token, { lowPriority: true })
    if (response.type !== 'response' || !response.body) {
      codeLens.command = {
        title: response.type === 'cancelled'
          ? ''
          : 'could not determine implementation',
        command: ''
      }
      return codeLens
    }
    const locations = response.body
      .map(reference => {
        return {
          uri: this.client.toResource(reference.file),
          range: {
            start: typeConverters.Position.fromLocation(reference.start),
            end: {
              line: reference.start.line,
              character: 0
            }
          }
        }
      })
      // Exclude original from implementations
      .filter(
        location => !(
          location.uri.toString() === uri &&
          location.range.start.line === codeLens.range.start.line &&
          location.range.start.character ===
          codeLens.range.start.character
        )
      )
    codeLens.command = this.getCommand(locations, codeLens)
    return codeLens
  }

  private getCommand(
    locations: Location[],
    codeLens: CodeLens,
  ): Command | undefined {
    let { uri } = codeLens.data
    return {
      title: this.getTitle(locations),
      command: locations.length ? 'editor.action.showReferences' : '',
      arguments: [uri, codeLens.range.start, locations]
    }
  }

  private getTitle(locations: Location[]): string {
    return locations.length === 1 ? '1 implementation' : `${locations.length} implementations`
  }

  protected extractSymbol(
    document: TextDocument,
    item: Proto.NavigationTree,
    parent: Proto.NavigationTree | null
  ): Range | null {
    const lang = document.languageId.startsWith('typescript') ? 'typescript' : 'javascript'
    const config = workspace.getConfiguration(`${lang}.implementationsCodeLens`, document)
    const kindModifiers = item.kindModifiers ?? ''

    // Always show on interfaces
    if (item.kind === PConst.Kind.interface) {
      return getSymbolRange(document, item)
    }

    // Always show on abstract classes/properties
    if (
      (item.kind === PConst.Kind.class ||
        item.kind === PConst.Kind.method ||
        item.kind === PConst.Kind.memberVariable ||
        item.kind === PConst.Kind.memberGetAccessor ||
        item.kind === PConst.Kind.memberSetAccessor) &&
      /\babstract\b/.test(kindModifiers)
    ) {
      return getSymbolRange(document, item)
    }

    // If configured, show on interface methods
    if (
      item.kind === PConst.Kind.method &&
      parent?.kind === PConst.Kind.interface &&
      config.get<boolean>('showOnInterfaceMethods', false)
    ) {
      return getSymbolRange(document, item)
    }

    // If configured, show on all class methods
    if (
      item.kind === PConst.Kind.method &&
      parent?.kind === PConst.Kind.class &&
      config.get<boolean>('showOnAllClassMethods', false)
    ) {
      // But not private ones as these can never be overridden
      if (/\bprivate\b/.test(kindModifiers)) {
        return null
      }
      return getSymbolRange(document, item)
    }

    return null
  }
}
