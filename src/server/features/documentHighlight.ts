/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { TextDocument } from 'coc.nvim'
import { DocumentHighlightProvider } from 'coc.nvim'
import { CancellationToken, DocumentHighlight, DocumentHighlightKind, Position } from 'vscode-languageserver-protocol'
import { flatten } from '../../utils/arrays'
import Proto from '../protocol'
import { ITypeScriptServiceClient } from '../typescriptService'
import * as typeConverters from '../utils/typeConverters'

export default class TypeScriptDocumentHighlightProvider implements DocumentHighlightProvider {
  public constructor(private readonly client: ITypeScriptServiceClient) {}

  public async provideDocumentHighlights(
    resource: TextDocument,
    position: Position,
    token: CancellationToken
  ): Promise<DocumentHighlight[]> {
    const file = this.client.toPath(resource.uri)
    if (!file) return []

    const args = {
      ...typeConverters.Position.toFileLocationRequestArgs(file, position),
      filesToSearch: [file]
    }
    try {
      const response = await this.client.execute('documentHighlights', args, token)
      if (response.type !== 'response' || !response.body) {
        return []
      }
      return flatten(
        response.body
          .filter(highlight => highlight.file === file)
          .map(convertDocumentHighlight))

    } catch (_e) {
      return []
    }
  }
}

function convertDocumentHighlight(highlight: Proto.DocumentHighlightsItem): ReadonlyArray<DocumentHighlight> {
  return highlight.highlightSpans.map(span => {
    return {
      range: typeConverters.Range.fromTextSpan(span),
      kind: span.kind === 'writtenReference' ? DocumentHighlightKind.Write : DocumentHighlightKind.Read
    }
  })
}
