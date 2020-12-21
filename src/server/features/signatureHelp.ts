/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { SignatureHelpProvider, TextDocument } from 'coc.nvim'
import { CancellationToken, Position, SignatureHelp, SignatureInformation } from 'vscode-languageserver-protocol'
import * as Proto from '../protocol'
import { ITypeScriptServiceClient } from '../typescriptService'
import * as Previewer from '../utils/previewer'
import * as typeConverters from '../utils/typeConverters'

export default class TypeScriptSignatureHelpProvider implements SignatureHelpProvider {
  public static readonly triggerCharacters = ['(', ',', '<']

  public constructor(private readonly client: ITypeScriptServiceClient) {}

  public async provideSignatureHelp(
    document: TextDocument,
    position: Position,
    token: CancellationToken
  ): Promise<SignatureHelp | undefined> {
    const filepath = this.client.toPath(document.uri)
    if (!filepath) {
      return undefined
    }
    const args: Proto.SignatureHelpRequestArgs = typeConverters.Position.toFileLocationRequestArgs(
      filepath,
      position
    )

    let response
    try {
      response = await this.client.interruptGetErr(() => this.client.execute('signatureHelp', args, token))
    } catch (e) {
      return undefined
    }
    if (response.type !== 'response' || !response.body) {
      return undefined
    }
    let info = response.body

    const result: SignatureHelp = {
      activeSignature: info.selectedItemIndex,
      activeParameter: this.getActiveParmeter(info),
      signatures: info.items.map(signature => {
        return this.convertSignature(signature)
      })
    }
    return result
  }

  private getActiveParmeter(info: Proto.SignatureHelpItems): number {
    const activeSignature = info.items[info.selectedItemIndex]
    if (activeSignature && activeSignature.isVariadic) {
      return Math.min(info.argumentIndex, activeSignature.parameters.length - 1)
    }
    return info.argumentIndex
  }

  private convertSignature(item: Proto.SignatureHelpItem): SignatureInformation {
    let parameters = item.parameters.map(p => {
      return {
        label: Previewer.plain(p.displayParts),
        documentation: Previewer.markdownDocumentation(p.documentation, [])
      }
    })
    let label = Previewer.plain(item.prefixDisplayParts)
    label += parameters.map(parameter => parameter.label).join(Previewer.plain(item.separatorDisplayParts))
    label += Previewer.plain(item.suffixDisplayParts)
    return {
      label,
      documentation: Previewer.markdownDocumentation(
        item.documentation,
        item.tags?.filter(x => x.name !== 'param')
      ),
      parameters
    }
  }
}
