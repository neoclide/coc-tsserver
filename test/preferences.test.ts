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

function getPreferences(manager: FileConfigurationManager, language: string) {
  const doc = {
    languageId: language,
    uri: 'file:///test.' + (language === 'typescript' ? 'ts' : 'js'),
  } as any
  return manager.getPreferences(language, doc)
}

describe('tsserver preferences', () => {
  beforeEach(async () => {
    await workspace.nvim.command('enew!')
  })

  afterEach(async () => {
    await workspace.getConfiguration('typescript.preferences').update('autoImportSpecifierExcludeRegexes', undefined, true)
    await workspace.getConfiguration('javascript.preferences').update('autoImportSpecifierExcludeRegexes', undefined, true)
    await workspace.getConfiguration('typescript.preferences').update('organizeImports', undefined, true)
    await workspace.getConfiguration('javascript.preferences').update('organizeImports', undefined, true)
    await workspace.getConfiguration('typescript.hover').update('maximumLength', undefined, true)
    await workspace.getConfiguration('javascript.hover').update('maximumLength', undefined, true)
    await workspace.getConfiguration('typescript.preferences').update('importModuleSpecifier', undefined, true)
    await workspace.getConfiguration('javascript.preferences').update('importModuleSpecifier', undefined, true)
  })

  it('leaves autoImportSpecifierExcludeRegexes undefined by default', async () => {
    const manager = createManager()
    assert.equal(getPreferences(manager, 'typescript').autoImportSpecifierExcludeRegexes, undefined)
    assert.equal(getPreferences(manager, 'javascript').autoImportSpecifierExcludeRegexes, undefined)
  })

  it('passes typescript.preferences.autoImportSpecifierExcludeRegexes to tsserver', async () => {
    await workspace.getConfiguration('typescript.preferences').update('autoImportSpecifierExcludeRegexes', ['^lodash', '/foo/'], true)
    const manager = createManager()
    assert.deepEqual(getPreferences(manager, 'typescript').autoImportSpecifierExcludeRegexes, ['^lodash', '/foo/'])
  })

  it('passes javascript.preferences.autoImportSpecifierExcludeRegexes to tsserver', async () => {
    await workspace.getConfiguration('javascript.preferences').update('autoImportSpecifierExcludeRegexes', ['^moment'], true)
    const manager = createManager()
    assert.deepEqual(getPreferences(manager, 'javascript').autoImportSpecifierExcludeRegexes, ['^moment'])
  })

  it('leaves importModuleSpecifierPreference undefined by default', async () => {
    const manager = createManager()
    assert.equal(getPreferences(manager, 'typescript').importModuleSpecifierPreference, undefined)
    assert.equal(getPreferences(manager, 'javascript').importModuleSpecifierPreference, undefined)
  })

  it('passes typescript.preferences.importModuleSpecifier to tsserver', async () => {
    const manager = createManager()
    await workspace.getConfiguration('typescript.preferences').update('importModuleSpecifier', 'non-relative', true)
    assert.equal(getPreferences(manager, 'typescript').importModuleSpecifierPreference, 'non-relative')
    await workspace.getConfiguration('typescript.preferences').update('importModuleSpecifier', 'relative', true)
    assert.equal(getPreferences(manager, 'typescript').importModuleSpecifierPreference, 'relative')
    await workspace.getConfiguration('typescript.preferences').update('importModuleSpecifier', 'project-relative', true)
    assert.equal(getPreferences(manager, 'typescript').importModuleSpecifierPreference, 'project-relative')
  })

  it('passes javascript.preferences.importModuleSpecifier to tsserver', async () => {
    const manager = createManager()
    await workspace.getConfiguration('javascript.preferences').update('importModuleSpecifier', 'non-relative', true)
    assert.equal(getPreferences(manager, 'javascript').importModuleSpecifierPreference, 'non-relative')
  })

  it('uses default organize imports preferences', async () => {
    const manager = createManager()
    const prefs = getPreferences(manager, 'typescript')
    assert.equal(prefs.organizeImportsCollation, 'ordinal')
    assert.equal(prefs.organizeImportsIgnoreCase, 'auto')
    assert.equal(prefs.organizeImportsTypeOrder, undefined)
    assert.equal(prefs.organizeImportsCaseFirst, undefined)
    assert.equal(prefs.organizeImportsLocale, undefined)
  })

  it('passes unicode organize imports preferences when unicodeCollation is enabled', async () => {
    await workspace.getConfiguration('typescript.preferences').update('organizeImports', {
      unicodeCollation: 'unicode',
      caseFirst: 'upper',
      locale: 'en-US',
      numericCollation: true,
      accentCollation: false,
      typeOrder: 'first',
    }, true)
    const manager = createManager()
    const prefs = getPreferences(manager, 'typescript')
    assert.equal(prefs.organizeImportsCollation, 'unicode')
    assert.equal(prefs.organizeImportsCaseFirst, 'upper')
    assert.equal(prefs.organizeImportsLocale, 'en-US')
    assert.equal(prefs.organizeImportsNumericCollation, true)
    assert.equal(prefs.organizeImportsAccentCollation, false)
    assert.equal(prefs.organizeImportsTypeOrder, 'first')
  })

  it('omits caseFirst when caseSensitivity is caseInsensitive', async () => {
    await workspace.getConfiguration('typescript.preferences').update('organizeImports', {
      unicodeCollation: 'unicode',
      caseSensitivity: 'caseInsensitive',
      caseFirst: 'lower',
    }, true)
    const manager = createManager()
    const prefs = getPreferences(manager, 'typescript')
    assert.equal(prefs.organizeImportsIgnoreCase, true)
    assert.equal(prefs.organizeImportsCaseFirst, undefined)
  })

  it('applies organize imports preferences to javascript documents', async () => {
    await workspace.getConfiguration('javascript.preferences').update('organizeImports', {
      caseSensitivity: 'caseSensitive',
      typeOrder: 'last',
    }, true)
    const manager = createManager()
    const prefs = getPreferences(manager, 'javascript')
    assert.equal(prefs.organizeImportsIgnoreCase, false)
    assert.equal(prefs.organizeImportsTypeOrder, 'last')
  })

  it('defaults maximumHoverLength to 500', async () => {
    const manager = createManager()
    assert.equal(getPreferences(manager, 'typescript').maximumHoverLength, 500)
    assert.equal(getPreferences(manager, 'javascript').maximumHoverLength, 500)
  })

  it('respects typescript.hover.maximumLength', async () => {
    await workspace.getConfiguration('typescript.hover').update('maximumLength', 1200, true)
    const manager = createManager()
    assert.equal(getPreferences(manager, 'typescript').maximumHoverLength, 1200)
  })

  it('falls back to the default when maximumHoverLength is invalid', async () => {
    await workspace.getConfiguration('typescript.hover').update('maximumLength', -1, true)
    const manager = createManager()
    assert.equal(getPreferences(manager, 'typescript').maximumHoverLength, 500)
  })

  it('sends global configuration even without a visible editor', async () => {
    const calls: string[] = []
    const execute = async (command: string) => {
      calls.push(command)
      return { type: 'response' }
    }
    const manager = new FileConfigurationManager({ apiVersion: { gte: () => true, lt: () => false }, toPath: (uri: string) => uri, execute } as any)
    const doc = {
      languageId: 'typescript',
      uri: 'file:///not-visible.ts',
    } as any
    await manager.setGlobalConfigurationFromDocument(doc, undefined as any)
    assert.deepEqual(calls, ['configure'])
  })
})
