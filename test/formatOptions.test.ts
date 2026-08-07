import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { workspace } from 'coc.nvim'
import FileConfigurationManager from '../src/server/features/fileConfigurationManager.ts'

function createManager(): FileConfigurationManager {
  const client = {
    apiVersion: { gte: () => true, lt: () => false },
    toPath: (uri: string) => uri,
    execute: async () => ({ type: 'response' }),
  } as any
  return new FileConfigurationManager(client)
}

function getFormatOptions(manager: FileConfigurationManager, language: string) {
  return (manager as any).getFormatOptions(
    { tabSize: 4, insertSpaces: true },
    language,
    'file:///test.' + (language === 'typescript' ? 'ts' : 'js')
  )
}

describe('format options', () => {
  beforeEach(async () => {
    await workspace.nvim.command('enew!')
  })

  afterEach(async () => {
    await workspace.getConfiguration('typescript.format').update('indentSwitchCase', undefined, true)
    await workspace.getConfiguration('javascript.format').update('indentSwitchCase', undefined, true)
  })

  it('sends indentSwitchCase default true in typescript format options', async () => {
    const manager = createManager()
    assert.equal(getFormatOptions(manager, 'typescript').indentSwitchCase, true)
  })

  it('sends indentSwitchCase default true in javascript format options', async () => {
    const manager = createManager()
    assert.equal(getFormatOptions(manager, 'javascript').indentSwitchCase, true)
  })

  it('respects typescript.format.indentSwitchCase=false', async () => {
    await workspace.getConfiguration('typescript.format').update('indentSwitchCase', false, true)
    const manager = createManager()
    assert.equal(getFormatOptions(manager, 'typescript').indentSwitchCase, false)
  })

  it('respects javascript.format.indentSwitchCase=false', async () => {
    await workspace.getConfiguration('javascript.format').update('indentSwitchCase', false, true)
    const manager = createManager()
    assert.equal(getFormatOptions(manager, 'javascript').indentSwitchCase, false)
  })
})
