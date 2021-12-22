/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import cp from 'child_process'
import os from 'os'
import path from 'path'
import fs from 'fs'
import Logger from './logger'

export interface IForkOptions {
  cwd?: string
  execArgv?: string[]
}

export function makeRandomHexString(length: number): string {
  let chars = ['0', '1', '2', '3', '4', '5', '6', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f']
  let result = ''
  for (let i = 0; i < length; i++) {
    const idx = Math.floor(chars.length * Math.random())
    result += chars[idx]
  }
  return result
}

export function getTempDirectory(): string | undefined {
  let dir = path.join(os.tmpdir(), `coc.nvim-${process.pid}`)
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir)
    }
  } catch (e) {
    return undefined
  }
  return dir
}

export function getTempFile(name: string): string | undefined {
  const fullName = 'coc-nvim-' + name
  let dir = getTempDirectory()
  if (!dir) return undefined
  return path.join(dir, fullName + '.sock')
}

export function createTempDirectory(name: string) {
  let dir = getTempDirectory()
  if (!dir) return undefined
  let res = path.join(dir, name)
  try {
    fs.mkdirSync(res)
  } catch (e) {
    return undefined
  }
  return res
}

function generatePatchedEnv(env: any, modulePath: string): any {
  const newEnv = Object.assign({}, env)
  newEnv['NODE_PATH'] = path.join(modulePath, '..', '..', '..')
  // Ensure we always have a PATH set
  newEnv['PATH'] = newEnv['PATH'] || process.env.PATH // tslint:disable-line
  return newEnv
}

export function fork(
  modulePath: string,
  args: string[],
  options: IForkOptions,
  logger: Logger,
): cp.ChildProcess {
  // Create the process
  logger.info('Forking TSServer', `PATH: ${modulePath} `)
  let childProcess = cp.fork(modulePath, args, {
    silent: true,
    cwd: undefined,
    env: generatePatchedEnv(process.env, modulePath),
    execArgv: options.execArgv
  })
  return childProcess
}
