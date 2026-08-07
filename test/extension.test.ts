import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { commands, workspace } from 'coc.nvim'
import extension from '../lib/index.js'

beforeEach(async () => {
  await workspace.nvim.command('enew!')
})

describe('coc-tsserver extension', () => {
  it('loads the extension entry', () => {
    assert.ok(extension)
    assert.equal(typeof extension.activate, 'function')
  })

  it('provides coc.nvim APIs', () => {
    assert.equal(typeof commands.executeCommand, 'function')
    assert.equal(typeof workspace.nvim.command, 'function')
  })

  it('communicates with Vim or Neovim', async () => {
    assert.equal(await workspace.nvim.eval('1 + 1'), 2)
  })
})
