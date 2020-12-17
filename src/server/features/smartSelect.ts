/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Proto from '../protocol'
import { ITypeScriptServiceClient } from '../typescriptService'
import { Range, Position, CancellationToken } from 'vscode-languageserver-protocol'
import { TextDocument } from 'coc.nvim'
import * as typeConverters from '../utils/typeConverters'
import { SelectionRangeProvider } from 'coc.nvim'

/**
 * A selection range represents a part of a selection hierarchy. A selection range
 * may have a parent selection range that contains it.
 */
export interface SelectionRange {
  /**
   * The [range](#Range) of this selection range.
   */
  range: Range
  /**
   * The parent selection range containing this range. Therefore `parent.range` must contain `this.range`.
   */
  parent?: SelectionRange
}

export default class SmartSelection implements SelectionRangeProvider {
  public constructor(
    private readonly client: ITypeScriptServiceClient
  ) { }

  public async provideSelectionRanges(
    document: TextDocument,
    positions: Position[],
    token: CancellationToken,
  ): Promise<SelectionRange[] | undefined> {
    const file = this.client.toPath(document.uri)
    if (!file) {
      return undefined
    }

    const args: Proto.SelectionRangeRequestArgs = {
      file,
      locations: positions.map(typeConverters.Position.toLocation)
    }
    const response = await this.client.execute('selectionRange', args, token)
    if (response.type !== 'response' || !response.body) {
      return undefined
    }
    return response.body.map(SmartSelection.convertSelectionRange)
  }

  private static convertSelectionRange(
    selectionRange: Proto.SelectionRange
  ): SelectionRange {
    return {
      range: typeConverters.Range.fromTextSpan(selectionRange.textSpan),
      parent: selectionRange.parent ? SmartSelection.convertSelectionRange(selectionRange.parent) : undefined,
    }
  }
}
