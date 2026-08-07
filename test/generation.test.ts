import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createGenerationGuardedHandler } from '../src/server/utils/generation.ts'

describe('generation guarded handler', () => {
  it('ignores values after the generation changes or the source becomes inactive', () => {
    let currentGeneration = 1
    let isActive = true
    const handled: string[] = []
    const handler = createGenerationGuardedHandler<string>(
      currentGeneration,
      () => currentGeneration,
      () => isActive,
      value => handled.push(value),
    )

    handler('current')
    isActive = false
    handler('inactive')
    isActive = true
    currentGeneration++
    handler('stale')

    assert.deepEqual(handled, ['current'])
  })
})
