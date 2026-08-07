import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { workspace } from 'coc.nvim'
import TypeScriptServiceClient from '../src/server/typescriptServiceClient.ts'
import { ServiceConfigurationProvider } from '../src/server/utils/configuration.ts'
import { PluginManager } from '../src/utils/plugins.ts'

function createClient(): TypeScriptServiceClient {
  const context = {
    subscriptions: [],
    extensionPath: process.cwd(),
    storagePath: '/tmp/coc-tsserver-test',
    asAbsolutePath: (p: string) => p,
    globalState: {
      get: async (_key: string, defaultValue?: unknown) => defaultValue,
      update: async () => undefined,
    },
  } as any
  const services = {
    pluginManager: new PluginManager(),
    logDirectoryProvider: {},
    processFactory: { fork: async () => undefined },
    cancellerFactory: { create: () => ({ cancel: () => undefined }) },
  } as any
  return new TypeScriptServiceClient(context, ['typescript'], services, undefined)
}

describe('workspace symbols library exclusion', () => {
  beforeEach(async () => {
    await workspace.nvim.command('enew!')
  })

  afterEach(async () => {
    await workspace.getConfiguration('typescript.workspaceSymbols').update('excludeLibrarySymbols', undefined, true)
  })

  it('defaults typescript.workspaceSymbols.excludeLibrarySymbols to true', () => {
    const configuration = new ServiceConfigurationProvider().loadFromWorkspace()
    assert.equal(configuration.workspaceSymbolsExcludeLibrarySymbols, true)
  })

  it('reads typescript.workspaceSymbols.excludeLibrarySymbols=false', async () => {
    await workspace.getConfiguration('typescript.workspaceSymbols').update('excludeLibrarySymbols', false, true)
    const configuration = new ServiceConfigurationProvider().loadFromWorkspace()
    assert.equal(configuration.workspaceSymbolsExcludeLibrarySymbols, false)
  })

  it('sends excludeLibrarySymbolsInNavTo when configuring tsserver', async () => {
    const client = createClient()
    const configureArgs: any[] = []
    ;(client as any).executeWithoutWaitingForResponse = (command: string, args: unknown) => {
      if (command === 'configure') {
        configureArgs.push(args)
      }
    }
    ;(client as any).serviceStarted(false)
    assert.equal(configureArgs.length, 1)
    assert.equal(configureArgs[0].preferences.excludeLibrarySymbolsInNavTo, true)
  })

  it('sends excludeLibrarySymbolsInNavTo=false when configured', async () => {
    await workspace.getConfiguration('typescript.workspaceSymbols').update('excludeLibrarySymbols', false, true)
    const client = createClient()
    const configureArgs: any[] = []
    ;(client as any).executeWithoutWaitingForResponse = (command: string, args: unknown) => {
      if (command === 'configure') {
        configureArgs.push(args)
      }
    }
    ;(client as any).serviceStarted(false)
    assert.equal(configureArgs.length, 1)
    assert.equal(configureArgs[0].preferences.excludeLibrarySymbolsInNavTo, false)
  })
})
