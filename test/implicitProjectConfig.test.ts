import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { workspace } from 'coc.nvim'
import API from '../src/server/utils/api.ts'
import { ImplicitProjectConfiguration } from '../src/server/utils/configuration.ts'
import { inferredProjectCompilerOptions, ProjectType } from '../src/server/utils/tsconfig.ts'

function serviceConfig(implicit: Partial<any>): any {
  return {
    implicitProjectConfiguration: {
      checkJs: false,
      experimentalDecorators: false,
      strictNullChecks: true,
      strictFunctionTypes: true,
      strict: true,
      module: undefined,
      target: undefined,
      ...implicit,
    },
  }
}

describe('implicit project configuration', () => {
  beforeEach(async () => {
    await workspace.nvim.command('enew!')
  })

  afterEach(async () => {
    await workspace.getConfiguration('tsserver.implicitProjectConfig').update('strict', undefined, true)
    await workspace.getConfiguration('tsserver.implicitProjectConfig').update('target', undefined, true)
  })

  it('defaults strict to true', () => {
    const config = new ImplicitProjectConfiguration(workspace.getConfiguration())
    assert.equal(config.strict, true)
  })

  it('respects tsserver.implicitProjectConfig.strict=false', async () => {
    await workspace.getConfiguration('tsserver.implicitProjectConfig').update('strict', false, true)
    const config = new ImplicitProjectConfiguration(workspace.getConfiguration())
    assert.equal(config.strict, false)
  })

  it('defaults target to ES2024', () => {
    const config = new ImplicitProjectConfiguration(workspace.getConfiguration())
    assert.equal(config.target, 'ES2024')
  })

  it('sends strict and explicit default overrides in inferred project compiler options', () => {
    const options = inferredProjectCompilerOptions(API.v500, ProjectType.TypeScript, serviceConfig({}))
    assert.equal(options.strict, true)
    assert.equal(options.strictNullChecks, true)
    assert.equal(options.strictFunctionTypes, true)
    assert.equal(options.checkJs, false)
    assert.equal(options.experimentalDecorators, false)
    assert.equal(options.jsx, 'react-jsx')
  })

  it('reflects disabled strict and checkJs in inferred project compiler options', () => {
    const options = inferredProjectCompilerOptions(API.v500, ProjectType.TypeScript, serviceConfig({
      strict: false,
      strictNullChecks: false,
      strictFunctionTypes: false,
      checkJs: true,
      experimentalDecorators: true,
    }))
    assert.equal(options.strict, false)
    assert.equal(options.strictNullChecks, false)
    assert.equal(options.strictFunctionTypes, false)
    assert.equal(options.checkJs, true)
    assert.equal(options.allowJs, true)
    assert.equal(options.experimentalDecorators, true)
  })
})
