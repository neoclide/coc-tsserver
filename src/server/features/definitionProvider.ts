/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { LocationLink, TextDocument } from 'coc.nvim'
import { DefinitionProvider, CancellationToken, Definition, Location, Position, DefinitionLink, ImplementationProvider, TypeDefinitionProvider } from 'coc.nvim'
import * as Proto from '../protocol'
import { ITypeScriptServiceClient } from '../typescriptService'
import API from '../utils/api'
import * as typeConverters from '../utils/typeConverters'

export default class TypeScriptDefinitionProvider implements DefinitionProvider, TypeDefinitionProvider, ImplementationProvider {
  constructor(private client: ITypeScriptServiceClient) {}

  protected async getSymbolLocations(
    definitionType: 'definition' | 'implementation' | 'typeDefinition',
    document: TextDocument,
    position: Position,
    token: CancellationToken
  ): Promise<Location[] | LocationLink[] | undefined> {
    const filepath = this.client.toPath(document.uri)
    if (!filepath) {
      return undefined
    }

    const args = typeConverters.Position.toFileLocationRequestArgs(
      filepath,
      position
    )
    try {
      const response = await this.client.execute(definitionType, args, token)
      if (response.type !== 'response' || !response.body) {
        return undefined
      }
      const locations: Proto.FileSpanWithContext[] = (response.type == 'response' && response.body) || []
      return locations.map(location => {
        const target = typeConverters.Location.fromTextSpan(this.client.toResource(location.file), location)
        if (location.contextStart && location.contextEnd) {
          return {
            targetRange: typeConverters.Range.fromLocations(location.contextStart, location.contextEnd),
            targetUri: target.uri,
            targetSelectionRange: target.range,
          } as any
        }
        return target
      }
      )
    } catch {
      return []
    }
  }

  public async provideDefinition(
    document: TextDocument,
    position: Position,
    token: CancellationToken
  ): Promise<Definition | DefinitionLink[] | undefined> {
    if (this.client.apiVersion.gte(API.v270)) {
      const filepath = this.client.toOpenedFilePath(document.uri)
      if (!filepath) {
        return undefined
      }

      const args = typeConverters.Position.toFileLocationRequestArgs(filepath, position)
      const response = await this.client.execute('definitionAndBoundSpan', args, token)
      if (response.type !== 'response' || !response.body) {
        return undefined
      }

      const span = response.body.textSpan ? typeConverters.Range.fromTextSpan(response.body.textSpan) : undefined
      return response.body.definitions
        .map((location): DefinitionLink => {
          const target = typeConverters.Location.fromTextSpan(this.client.toResource(location.file), location)
          if (location.contextStart && location.contextEnd) {
            return {
              originSelectionRange: span,
              targetRange: typeConverters.Range.fromLocations(location.contextStart, location.contextEnd),
              targetUri: target.uri,
              targetSelectionRange: target.range,
            }
          }
          return {
            originSelectionRange: span,
            targetRange: target.range,
            targetUri: target.uri,
            targetSelectionRange: target.range,
          }
        })
    }
    return await this.getSymbolLocations('definition', document, position, token)
  }

  public provideTypeDefinition(
    document: TextDocument,
    position: Position,
    token: CancellationToken): Promise<Definition | DefinitionLink[]> {
    return this.getSymbolLocations('typeDefinition', document, position, token)
  }

  public provideImplementation(
    document: TextDocument,
    position: Position,
    token: CancellationToken): Promise<Definition | DefinitionLink[]> {
    return this.getSymbolLocations('implementation', document, position, token)
  }
}
