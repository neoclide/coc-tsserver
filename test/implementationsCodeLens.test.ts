import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { workspace } from 'coc.nvim'
import TypeScriptImplementationsCodeLensProvider from '../src/server/features/implementationsCodeLens.ts'

function createProvider(): TypeScriptImplementationsCodeLensProvider {
  const client = {
    toPath: (uri: string) => uri,
    execute: async () => ({ type: 'response' }),
  } as any
  const cachedResponse = { execute: async () => ({ type: 'response', body: null }) } as any
  return new TypeScriptImplementationsCodeLensProvider(client, cachedResponse, 'typescript')
}

function item(kind: string, kindModifiers = '', name = kind): any {
  return {
    kind,
    kindModifiers,
    name,
    text: name,
    nameSpan: {
      start: { line: 1, offset: 1 },
      end: { line: 1, offset: name.length + 1 },
    },
  }
}

function extract(provider: TypeScriptImplementationsCodeLensProvider, doc: any, navItem: any, parent: any) {
  return (provider as any).extractSymbol(doc, navItem, parent)
}

const tsDoc = { languageId: 'typescript', uri: 'file:///test.ts' }

describe('implementations code lens', () => {
  beforeEach(async () => {
    await workspace.nvim.command('enew!')
  })

  afterEach(async () => {
    await workspace.getConfiguration('typescript.implementationsCodeLens').update('showOnInterfaceMethods', undefined, true)
    await workspace.getConfiguration('typescript.implementationsCodeLens').update('showOnAllClassMethods', undefined, true)
    await workspace.getConfiguration('javascript.implementationsCodeLens').update('showOnInterfaceMethods', undefined, true)
    await workspace.getConfiguration('javascript.implementationsCodeLens').update('showOnAllClassMethods', undefined, true)
  })

  it('always shows code lens on interfaces', async () => {
    const provider = createProvider()
    const range = extract(provider, tsDoc, item('interface'), null)
    assert.ok(range)
    assert.equal(range.start.line, 0)
  })

  it('always shows code lens on abstract class methods', async () => {
    const provider = createProvider()
    const range = extract(provider, tsDoc, item('method', 'abstract'), item('class'))
    assert.ok(range)
  })

  it('does not show code lens on non-abstract class methods by default', async () => {
    const provider = createProvider()
    assert.equal(extract(provider, tsDoc, item('method'), item('class')), null)
  })

  it('shows code lens on all class methods when configured', async () => {
    await workspace.getConfiguration('typescript.implementationsCodeLens').update('showOnAllClassMethods', true, true)
    const provider = createProvider()
    assert.ok(extract(provider, tsDoc, item('method'), item('class')))
  })

  it('does not show code lens on private class methods', async () => {
    await workspace.getConfiguration('typescript.implementationsCodeLens').update('showOnAllClassMethods', true, true)
    const provider = createProvider()
    assert.equal(extract(provider, tsDoc, item('method', 'private'), item('class')), null)
  })

  it('does not show code lens on interface methods by default', async () => {
    const provider = createProvider()
    assert.equal(extract(provider, tsDoc, item('method'), item('interface')), null)
  })

  it('shows code lens on interface methods when configured', async () => {
    await workspace.getConfiguration('typescript.implementationsCodeLens').update('showOnInterfaceMethods', true, true)
    const provider = createProvider()
    assert.ok(extract(provider, tsDoc, item('method'), item('interface')))
  })

  it('respects javascript settings for javascript documents', async () => {
    await workspace.getConfiguration('javascript.implementationsCodeLens').update('showOnAllClassMethods', true, true)
    const provider = createProvider()
    const jsDoc = { languageId: 'javascript', uri: 'file:///test.js' }
    assert.ok(extract(provider, jsDoc, item('method'), item('class')))
    assert.equal(extract(provider, jsDoc, item('method'), item('interface')), null)
  })
})
