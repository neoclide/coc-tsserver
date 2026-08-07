import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { SignatureHelpState } from '../src/server/features/signatureHelpState.ts'

function sig(label: string): any {
  return { label }
}

function context(isRetrigger: boolean, activeSignatureHelp?: any): any {
  return { isRetrigger, activeSignatureHelp }
}

describe('signature help state', () => {
  it('follows the tsserver selected signature on the first request', () => {
    const state = new SignatureHelpState()
    const document: any = {}
    const requestId = state.startRequest(document)
    const active = state.getActiveSignature(
      document,
      requestId,
      context(false),
      1,
      [sig('a'), sig('b'), sig('c')]
    )
    assert.equal(active, 1)
  })

  it('keeps the user-selected signature on retrigger', () => {
    const state = new SignatureHelpState()
    const document: any = {}
    let requestId = state.startRequest(document)
    state.getActiveSignature(document, requestId, context(false), 0, [sig('a'), sig('b')])

    // User selects the second signature.
    const activeSignatureHelp = {
      activeSignature: 1,
      signatures: [sig('a'), sig('b')],
    }
    requestId = state.startRequest(document)
    const active = state.getActiveSignature(
      document,
      requestId,
      context(true, activeSignatureHelp),
      0,
      [sig('a'), sig('b')]
    )
    assert.equal(active, 1)
  })

  it('falls back to the tsserver selection when the overload set changed', () => {
    const state = new SignatureHelpState()
    const document: any = {}
    let requestId = state.startRequest(document)
    state.getActiveSignature(document, requestId, context(false), 1, [sig('a'), sig('b'), sig('c')])

    const activeSignatureHelp = {
      activeSignature: 1,
      signatures: [sig('a'), sig('b'), sig('c')],
    }
    requestId = state.startRequest(document)
    const active = state.getActiveSignature(
      document,
      requestId,
      context(true, activeSignatureHelp),
      0,
      [sig('a'), sig('d')]
    )
    assert.equal(active, 0)
  })

  it('ignores stale responses from superseded requests', () => {
    const state = new SignatureHelpState()
    const document: any = {}
    state.startRequest(document)
    const staleRequestId = 1
    const active = state.getActiveSignature(
      document,
      staleRequestId,
      context(false),
      2,
      [sig('a'), sig('b'), sig('c')]
    )
    assert.equal(active, 2)
  })
})
