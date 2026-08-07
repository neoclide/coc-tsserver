import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { SignatureHelpTriggerKind } from 'vscode-languageserver-protocol'
import { toTsTriggerReason } from '../src/server/features/signatureHelp.ts'

describe('toTsTriggerReason', () => {
  it('maps Invoked to { kind: "invoked" }', () => {
    assert.deepEqual(toTsTriggerReason({ triggerKind: SignatureHelpTriggerKind.Invoked } as any), { kind: 'invoked' })
  })

  it('maps TriggerCharacter with a character to characterTyped', () => {
    assert.deepEqual(
      toTsTriggerReason({ triggerKind: SignatureHelpTriggerKind.TriggerCharacter, triggerCharacter: '(' } as any),
      { kind: 'characterTyped', triggerCharacter: '(' }
    )
  })

  it('maps a ContentChange retrigger to retrigger', () => {
    assert.deepEqual(
      toTsTriggerReason({ triggerKind: SignatureHelpTriggerKind.ContentChange, isRetrigger: true } as any),
      { kind: 'retrigger' }
    )
  })

  it('maps a ContentChange without retrigger to invoked', () => {
    assert.deepEqual(
      toTsTriggerReason({ triggerKind: SignatureHelpTriggerKind.ContentChange, isRetrigger: false } as any),
      { kind: 'invoked' }
    )
  })
})
