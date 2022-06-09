/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument, workspace } from 'coc.nvim'
import { FoldingContext, FoldingRangeProvider } from 'coc.nvim'
import { CancellationToken } from 'vscode-jsonrpc'
import { FoldingRange } from 'vscode-languageserver-types'
import Proto from '../protocol'
import { ITypeScriptServiceClient } from '../typescriptService'
import * as typeConverters from '../utils/typeConverters'

export default class TypeScriptFoldingProvider implements FoldingRangeProvider {
  public constructor(private readonly client: ITypeScriptServiceClient) {}

  public async provideFoldingRanges(
    document: TextDocument,
    _context: FoldingContext,
    token: CancellationToken
  ): Promise<FoldingRange[] | undefined> {
    const file = this.client.toPath(document.uri)
    if (!file) {
      return
    }

    const args: Proto.FileRequestArgs = { file }
    const res = await this.client.execute('getOutliningSpans', args, token)
    if (res.type != 'response') {
      return
    }
    const { body } = res
    if (!body) {
      return
    }

    return body
      .map(span => this.convertOutliningSpan(span, document))
      .filter(foldingRange => !!foldingRange) as FoldingRange[]
  }

  private convertOutliningSpan(
    span: Proto.OutliningSpan,
    document: TextDocument
  ): FoldingRange | undefined {
    const range = typeConverters.Range.fromTextSpan(span.textSpan)
    const kind = TypeScriptFoldingProvider.getFoldingRangeKind(span)
    let { start, end } = range

    // Workaround for #49904
    if (span.kind === 'comment') {
      let doc = workspace.getDocument(document.uri)
      const line = doc.getline(start.line)
      if (line.match(/\/\/\s*#endregion/gi)) {
        return undefined
      }
    } else if (span.kind === 'code') {
      let doc = workspace.getDocument(document.uri)
      if (end.line > start.line && /^\s*}/.test(doc.getline(end.line))) {
        end.line -= 1
        end.character = doc.getline(end.line).length
      }
    }
    return FoldingRange.create(start.line, end.line, start.character, end.character, kind)
  }

  private static getFoldingRangeKind(
    span: Proto.OutliningSpan
  ): string {
    switch (span.kind) {
      case 'comment':
      case 'region':
      case 'imports':
      case 'code':
        return span.kind
      default:
        return undefined
    }
  }
}
