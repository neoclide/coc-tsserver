/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { CallHierarchyProvider, TextDocument, Uri, workspace } from 'coc.nvim'
import path from "path"
import { CallHierarchyIncomingCall, CallHierarchyItem, CallHierarchyOutgoingCall, CancellationToken, Position, SymbolTag } from 'vscode-languageserver-protocol'
import type * as Proto from '../protocol'
import * as PConst from '../protocol.const'
import { ITypeScriptServiceClient } from '../typescriptService'
import API from '../utils/api'
import * as typeConverters from '../utils/typeConverters'

export default class TypeScriptCallHierarchySupport implements CallHierarchyProvider {
  public static readonly minVersion = API.v380

  public constructor(private readonly client: ITypeScriptServiceClient) {}

  public async prepareCallHierarchy(
    document: TextDocument,
    position: Position,
    token: CancellationToken
  ): Promise<CallHierarchyItem | CallHierarchyItem[] | undefined> {
    const filepath = this.client.toOpenedFilePath(document.uri)
    if (!filepath) {
      return undefined
    }

    const args = typeConverters.Position.toFileLocationRequestArgs(filepath, position)
    const response = await this.client.execute('prepareCallHierarchy', args, token)
    if (response.type !== 'response' || !response.body) {
      return undefined
    }

    return Array.isArray(response.body)
      ? response.body.map(fromProtocolCallHierarchyItem)
      : fromProtocolCallHierarchyItem(response.body)
  }

  public async provideCallHierarchyIncomingCalls(item: CallHierarchyItem, token: CancellationToken): Promise<CallHierarchyIncomingCall[] | undefined> {
    const filepath = this.client.toPath(item.uri)
    if (!filepath) {
      return undefined
    }

    const args = typeConverters.Position.toFileLocationRequestArgs(filepath, item.selectionRange.start)
    const response = await this.client.execute('provideCallHierarchyIncomingCalls', args, token)
    if (response.type !== 'response' || !response.body) {
      return undefined
    }

    return response.body.map(fromProtocolCallHierarchyIncomingCall)
  }

  public async provideCallHierarchyOutgoingCalls(item: CallHierarchyItem, token: CancellationToken): Promise<CallHierarchyOutgoingCall[] | undefined> {
    const filepath = this.client.toPath(item.uri)
    if (!filepath) {
      return undefined
    }

    const args = typeConverters.Position.toFileLocationRequestArgs(filepath, item.selectionRange.start)
    const response = await this.client.execute('provideCallHierarchyOutgoingCalls', args, token)
    if (response.type !== 'response' || !response.body) {
      return undefined
    }

    return response.body.map(fromProtocolCallHierarchyOutgoingCall)
  }
}

function isSourceFileItem(item: Proto.CallHierarchyItem) {
  return item.kind === PConst.Kind.script || item.kind === PConst.Kind.module && item.selectionSpan.start.line === 1 && item.selectionSpan.start.offset === 1
}

function parseKindModifier(kindModifiers: string): Set<string> {
  return new Set(kindModifiers.split(/,|\s+/g))
}

function fromProtocolCallHierarchyItem(item: Proto.CallHierarchyItem): CallHierarchyItem {
  const useFileName = isSourceFileItem(item)
  const name = useFileName ? path.basename(item.file) : item.name
  const detail = useFileName ? path.relative(workspace.cwd, path.dirname(item.file)) : item.containerName ?? ''
  const result: CallHierarchyItem = {
    name,
    detail,
    uri: Uri.file(item.file).toString(),
    kind: typeConverters.SymbolKind.fromProtocolScriptElementKind(item.kind),
    range: typeConverters.Range.fromTextSpan(item.span),
    selectionRange: typeConverters.Range.fromTextSpan(item.selectionSpan)
  }

  const kindModifiers = item.kindModifiers ? parseKindModifier(item.kindModifiers) : undefined
  if (kindModifiers?.has(PConst.KindModifiers.deprecated)) {
    result.tags = [SymbolTag.Deprecated]
  }
  return result
}

function fromProtocolCallHierarchyIncomingCall(item: Proto.CallHierarchyIncomingCall): CallHierarchyIncomingCall {
  return {
    from: fromProtocolCallHierarchyItem(item.from),
    fromRanges: item.fromSpans.map(typeConverters.Range.fromTextSpan)
  }
}

function fromProtocolCallHierarchyOutgoingCall(item: Proto.CallHierarchyOutgoingCall): CallHierarchyOutgoingCall {
  return {
    to: fromProtocolCallHierarchyItem(item.to),
    fromRanges: item.fromSpans.map(typeConverters.Range.fromTextSpan)
  }
}
