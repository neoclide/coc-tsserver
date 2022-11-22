/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CodeLensProvider, TextDocument } from 'coc.nvim'
import { CancellationToken, CodeLens, Range } from 'vscode-languageserver-protocol'
import * as Proto from '../protocol'
import { CachedResponse } from '../tsServer/cachedResponse'
import { ITypeScriptServiceClient } from '../typescriptService'
import { escapeRegExp } from '../utils/regexp'
import * as typeConverters from '../utils/typeConverters'

export abstract class TypeScriptBaseCodeLensProvider implements CodeLensProvider {
  public constructor(
    protected client: ITypeScriptServiceClient,
    private cachedResponse: CachedResponse<Proto.NavTreeResponse>,
    protected modeId: string
  ) {}

  public async provideCodeLenses(
    document: TextDocument,
    token: CancellationToken
  ): Promise<CodeLens[]> {
    const filepath = this.client.toPath(document.uri)
    if (!filepath) {
      return []
    }

    try {
      const response = await this.cachedResponse.execute(document, () =>
        this.client.execute('navtree', { file: filepath }, token)
      )
      if (response.type !== 'response') {
        return []
      }
      const tree = response.body
      const referenceableSpans: Range[] = []
      if (tree && tree.childItems) {
        tree.childItems.forEach(item =>
          this.walkNavTree(document, item, null, referenceableSpans)
        )
      }
      return referenceableSpans.map(
        range => {
          return {
            range,
            data: { uri: document.uri }
          }
        }
      )
    } catch {
      return []
    }
  }

  protected abstract extractSymbol(
    document: TextDocument,
    item: Proto.NavigationTree,
    parent: Proto.NavigationTree | null
  ): Range | null

  private walkNavTree(
    document: TextDocument,
    item: Proto.NavigationTree,
    parent: Proto.NavigationTree | null,
    results: Range[]
  ): void {
    if (!item) {
      return
    }

    const range = this.extractSymbol(document, item, parent)
    if (range) {
      results.push(range)
    }
    if (item.childItems) {
      item.childItems.forEach(child =>
        this.walkNavTree(document, child, item, results)
      )
    }
  }
}

export function getSymbolRange(
  document: TextDocument,
  item: Proto.NavigationTree
): Range | null {
  if (item.nameSpan) {
    return typeConverters.Range.fromTextSpan(item.nameSpan)
  }

  // In older versions, we have to calculate this manually. See #23924
  const span = item.spans && item.spans[0]
  if (!span) {
    return null
  }

  const range = typeConverters.Range.fromTextSpan(span)
  const text = document.getText(range)

  const identifierMatch = new RegExp(`^(.*?(\\b|\\W))${escapeRegExp(item.text || '')}(\\b|\\W)`, 'gm')
  const match = identifierMatch.exec(text)
  const prefixLength = match ? match.index + match[1].length : 0
  const startOffset = document.offsetAt(range.start) + prefixLength
  return {
    start: document.positionAt(startOffset),
    end: document.positionAt(startOffset + item.text.length)
  }
}
