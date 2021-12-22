/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import cp from 'child_process'
import net from 'net'
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

function generatePipeName(): string {
  return getPipeName(makeRandomHexString(40))
}

function getPipeName(name: string): string | undefined {
  const fullName = 'coc-tsc-' + name
  if (process.platform === 'win32') {
    return '\\\\.\\pipe\\' + fullName + '-sock'
  }
  const tmpdir = getTempDirectory()
  if (!tmpdir) return undefined
  // Mac/Unix: use socket file
  return path.join(tmpdir, fullName + '.sock')
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

function generatePatchedEnv(
  env: any,
  stdInPipeName: string,
  stdOutPipeName: string,
  stdErrPipeName: string
): any {
  const newEnv = Object.assign({}, env)

  // Set the two unique pipe names and the electron flag as process env
  newEnv['STDIN_PIPE_NAME'] = stdInPipeName // tslint:disable-line
  newEnv['STDOUT_PIPE_NAME'] = stdOutPipeName // tslint:disable-line
  newEnv['STDERR_PIPE_NAME'] = stdErrPipeName // tslint:disable-line
  newEnv['TSS_LOG'] = `-level verbose -file ${path.join(os.tmpdir(), 'coc-nvim-tsc.log')}` // tslint:disable-line

  // Ensure we always have a PATH set
  newEnv['PATH'] = newEnv['PATH'] || process.env.PATH // tslint:disable-line
  return newEnv
}

export function fork(
  modulePath: string,
  args: string[],
  options: IForkOptions,
  logger: Logger,
  callback: (error: any, cp: cp.ChildProcess | null) => void
): void {
  let callbackCalled = false
  const resolve = (result: cp.ChildProcess) => {
    if (callbackCalled) return
    callbackCalled = true
    callback(null, result)
  }
  const reject = (err: any) => {
    if (callbackCalled) return
    callbackCalled = true
    callback(err, null)
  }

  // Generate three unique pipe names
  const stdInPipeName = generatePipeName()
  const stdOutPipeName = generatePipeName()
  const stdErrPipeName = generatePipeName()

  const newEnv = generatePatchedEnv(
    process.env,
    stdInPipeName,
    stdOutPipeName,
    stdErrPipeName
  )
  newEnv['NODE_PATH'] = path.join(modulePath, '..', '..', '..')

  let childProcess: cp.ChildProcess
  // Begin listening to stderr pipe
  let stdErrServer = net.createServer(stdErrStream => {
    // From now on the childProcess.stderr is available for reading
    childProcess.stderr = stdErrStream
  })
  stdErrServer.listen(stdErrPipeName)

  // Begin listening to stdout pipe
  let stdOutServer = net.createServer(stdOutStream => {
    // The child process will write exactly one chunk with content `ready` when it has installed a listener to the stdin pipe

    stdOutStream.once('data', (_chunk: Buffer) => {
      // The child process is sending me the `ready` chunk, time to connect to the stdin pipe
      childProcess.stdin = net.connect(stdInPipeName) as any

      // From now on the childProcess.stdout is available for reading
      childProcess.stdout = stdOutStream

      resolve(childProcess)
    })
  })
  stdOutServer.listen(stdOutPipeName)

  let serverClosed = false
  const closeServer = () => {
    if (serverClosed) {
      return
    }
    serverClosed = true
    stdOutServer.close()
    stdErrServer.close()
  }

  // Create the process
  logger.info('Forking TSServer', `PATH: ${newEnv['PATH']} `)

  const bootstrapperPath = path.resolve(__dirname, '../bin/tsserverForkStart')
  childProcess = cp.fork(bootstrapperPath, [modulePath].concat(args), {
    silent: true,
    cwd: undefined,
    env: newEnv,
    execArgv: options.execArgv
  })

  childProcess.once('error', (err: Error) => {
    closeServer()
    reject(err)
  })

  childProcess.once('exit', (err: Error) => {
    closeServer()
    reject(err)
  })
}
