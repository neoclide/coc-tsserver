/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, LinkedEditingRangeProvider, LinkedEditingRanges, Position, TextDocument } from 'coc.nvim';
import { ITypeScriptServiceClient } from '../typescriptService';
import API from '../utils/api';
import * as typeConverters from '../utils/typeConverters';

export default class TypeScriptLinkedEditingRangeProvider implements LinkedEditingRangeProvider {

	public static readonly minVersion = API.v510;

	public constructor(private readonly client: ITypeScriptServiceClient) {}

	async provideLinkedEditingRanges(document: TextDocument, position: Position, token: CancellationToken): Promise<LinkedEditingRanges | undefined> {
		const filepath = this.client.toOpenedFilePath(document.uri);
		if (!filepath) {
			return undefined;
		}

		const args = typeConverters.Position.toFileLocationRequestArgs(filepath, position);
		const response = await this.client.execute('linkedEditingRange', args, token);
		if (response.type !== 'response' || !response.body) {
			return undefined;
		}

		const ranges = response.body.ranges.map(range => typeConverters.Range.fromTextSpan(range));
		return { ranges, wordPattern: response.body.wordPattern }
	}
}
