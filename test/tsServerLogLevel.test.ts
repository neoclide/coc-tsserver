import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import path from 'node:path'
import { TsServerLogLevel } from '../src/server/utils/configuration.ts'

describe('tsserver log level', () => {
  it('maps requestTime to TsServerLogLevel.RequestTime', () => {
    assert.equal(TsServerLogLevel.fromString('requestTime'), TsServerLogLevel.RequestTime)
  })

  it('maps TsServerLogLevel.RequestTime back to requestTime', () => {
    assert.equal(TsServerLogLevel.toString(TsServerLogLevel.RequestTime), 'requestTime')
  })

  it('keeps existing log levels working', () => {
    assert.equal(TsServerLogLevel.toString(TsServerLogLevel.Off), 'off')
    assert.equal(TsServerLogLevel.toString(TsServerLogLevel.Verbose), 'verbose')
    assert.equal(TsServerLogLevel.fromString('verbose'), TsServerLogLevel.Verbose)
  })

  it('declares requestTime in the tsserver.log manifest enum', () => {
    const pkg = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'))
    const properties = {}
    const sections = Array.isArray(pkg.contributes.configuration)
      ? pkg.contributes.configuration
      : [pkg.contributes.configuration]
    for (const section of sections) {
      Object.assign(properties, section.properties)
    }
    assert.ok(properties['tsserver.log'].enum.includes('requestTime'))
  })
})
