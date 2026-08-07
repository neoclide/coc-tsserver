import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { requestReloadProjects } from '../src/server/utils/reloadProjects.ts'

describe('requestReloadProjects', () => {
  it('sends reloadProjects without waiting for a response', () => {
    const calls: string[] = []
    const client = {
      execute: (...args: any[]) => {
        calls.push(`execute:${args[0]}`)
      },
      executeWithoutWaitingForResponse: (...args: any[]) => {
        calls.push(`executeWithoutWaitingForResponse:${args[0]}`)
      },
    } as any

    requestReloadProjects(client)

    assert.deepEqual(calls, ['executeWithoutWaitingForResponse:reloadProjects'])
  })

  it('does not wait for a response that tsserver never sends', () => {
    const client = {
      executeWithoutWaitingForResponse: (command: string, args: any) => {
        assert.equal(command, 'reloadProjects')
        assert.equal(args, null)
      },
    } as any

    requestReloadProjects(client)
  })
})
