/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { TextDocument } from 'coc.nvim'
import type { SignatureHelpContext, SignatureInformation } from 'vscode-languageserver-protocol'

interface PreviousSignatureHelpState {
  readonly activeSignatureIndex: number
  readonly signatureLabels: readonly string[]
  readonly userSelectedSignatureLabel: string | undefined
}

/** Tracks automatic and user-selected signature help overloads between provider calls. */
export class SignatureHelpState {

  private readonly requestIds = new WeakMap<TextDocument, number>()
  private readonly previousSignatureHelpState = new WeakMap<TextDocument, PreviousSignatureHelpState>()

  public startRequest(document: TextDocument): number {
    const requestId = (this.requestIds.get(document) ?? 0) + 1
    this.requestIds.set(document, requestId)
    return requestId
  }

  public getActiveSignature(
    document: TextDocument,
    requestId: number,
    context: SignatureHelpContext,
    typeScriptSelectedSignatureIndex: number,
    signatures: readonly SignatureInformation[],
  ): number {
    if (requestId !== this.requestIds.get(document)) {
      return typeScriptSelectedSignatureIndex
    }

    const previousSignatureHelpState = this.previousSignatureHelpState.get(document)
    const previouslyActiveSignatureHelp = context.activeSignatureHelp
    let userSelectedSignatureLabel: string | undefined
    if (
      context.isRetrigger
      && previousSignatureHelpState
      && previouslyActiveSignatureHelp
      && this.hasMatchingSignatures(previouslyActiveSignatureHelp.signatures, previousSignatureHelpState.signatureLabels)
    ) {
      userSelectedSignatureLabel = previousSignatureHelpState.userSelectedSignatureLabel
      if (previouslyActiveSignatureHelp.activeSignature !== previousSignatureHelpState.activeSignatureIndex) {
        userSelectedSignatureLabel = previouslyActiveSignatureHelp.signatures[previouslyActiveSignatureHelp.activeSignature]?.label
      }
    }

    let activeSignatureIndex = typeScriptSelectedSignatureIndex
    if (userSelectedSignatureLabel !== undefined) {
      const userSelectedSignatureIndex = signatures.findIndex(signature => signature.label === userSelectedSignatureLabel)
      if (userSelectedSignatureIndex >= 0) {
        activeSignatureIndex = userSelectedSignatureIndex
      } else {
        userSelectedSignatureLabel = undefined
      }
    }

    this.previousSignatureHelpState.set(document, {
      activeSignatureIndex,
      signatureLabels: signatures.map(signature => signature.label),
      userSelectedSignatureLabel,
    })

    return activeSignatureIndex
  }

  private hasMatchingSignatures(signatures: readonly SignatureInformation[], signatureLabels: readonly string[]): boolean {
    return signatures.length === signatureLabels.length
      && signatures.every((signature, index) => signature.label === signatureLabels[index])
  }
}
