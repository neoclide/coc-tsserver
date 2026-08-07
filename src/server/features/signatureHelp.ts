/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { LinesTextDocument, SignatureHelp, SignatureHelpProvider } from 'coc.nvim'
import { CancellationToken, Position, SignatureHelpContext, SignatureHelpTriggerKind, SignatureInformation } from 'vscode-languageserver-protocol'
import * as Proto from '../protocol'
import { ITypeScriptServiceClient } from '../typescriptService'
import * as Previewer from '../utils/previewer'
import * as typeConverters from '../utils/typeConverters'
import { SignatureHelpState } from './signatureHelpState'

export default class TypeScriptSignatureHelpProvider implements SignatureHelpProvider {
  public static readonly triggerCharacters = ['(', ',', '<']

  private readonly state = new SignatureHelpState()

  public constructor(private readonly client: ITypeScriptServiceClient) {}

  public async provideSignatureHelp(
    document: LinesTextDocument,
    position: Position,
    token: CancellationToken,
    context: SignatureHelpContext
  ): Promise<SignatureHelp> {
    const filepath = this.client.toPath(document.uri)
    if (!filepath) {
      return undefined
    }
    const requestId = this.state.startRequest(document)
    const args: Proto.SignatureHelpRequestArgs = typeConverters.Position.toFileLocationRequestArgs(
      filepath,
      position
    )
    args.triggerReason = toTsTriggerReason(context)

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

    const signatures = info.items.map(signature => {
      return this.convertSignature(signature)
    })
    const activeSignature = this.state.getActiveSignature(document, requestId, context, info.selectedItemIndex, signatures)
    const result: SignatureHelp = {
      activeSignature,
      activeParameter: this.getActiveParameter(info, activeSignature),
      signatures
    }
    return result
  }

  private getActiveParameter(info: Proto.SignatureHelpItems, activeSignatureIndex: number): number {
    const activeSignature = info.items[activeSignatureIndex]
    if (activeSignature?.isVariadic) {
      return Math.min(info.argumentIndex, activeSignature.parameters.length - 1)
    }
    return info.argumentIndex
  }

  private convertSignature(item: Proto.SignatureHelpItem): SignatureInformation {
    let parameters = item.parameters.map(p => {
      return {
        label: Previewer.plainWithLinks(p.displayParts),
        documentation: Previewer.markdownDocumentation(p.documentation, [])
      }
    })
    let label = Previewer.plainWithLinks(item.prefixDisplayParts)
    label += parameters.map(parameter => parameter.label).join(Previewer.plainWithLinks(item.separatorDisplayParts))
    label += Previewer.plainWithLinks(item.suffixDisplayParts)
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

function toTsTriggerReason(context: SignatureHelpContext): Proto.SignatureHelpTriggerReason {
  switch (context.triggerKind) {
    case SignatureHelpTriggerKind.TriggerCharacter:
      if (context.triggerCharacter) {
        if (context.isRetrigger) {
          return { kind: 'retrigger', triggerCharacter: context.triggerCharacter as Proto.SignatureHelpRetriggerCharacter }
        } else {
          return { kind: 'characterTyped', triggerCharacter: context.triggerCharacter as Proto.SignatureHelpTriggerCharacter }
        }
      } else {
        return { kind: 'invoked' }
      }

    case SignatureHelpTriggerKind.ContentChange:
      return context.isRetrigger ? { kind: 'retrigger' } : { kind: 'invoked' }

    case SignatureHelpTriggerKind.Invoke:
    default:
      return { kind: 'invoked' }
  }
}
