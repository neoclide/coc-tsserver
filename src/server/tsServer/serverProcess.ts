/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as child_process from 'child_process'
import { Emitter } from 'coc.nvim'
import { Socket } from 'net'
import * as path from 'path'
import type { Readable } from 'stream'
import type * as Proto from '../protocol'
import API from '../utils/api'
import { TypeScriptServiceConfiguration } from '../utils/configuration'
import { Disposable } from '../utils/dispose'
import { TsServerProcess, TsServerProcessFactory, TsServerProcessKind } from './server'
import { TypeScriptVersion } from './versionProvider'

const defaultSize: number = 8192
const contentLength: string = 'Content-Length: '
const contentLengthSize: number = Buffer.byteLength(contentLength, 'utf8')
const blank: number = Buffer.from(' ', 'utf8')[0]
const backslashR: number = Buffer.from('\r', 'utf8')[0]
const backslashN: number = Buffer.from('\n', 'utf8')[0]

class ProtocolBuffer {

  private index: number = 0;
  private buffer: Buffer = Buffer.allocUnsafe(defaultSize);

  public append(data: string | Buffer): void {
    let toAppend: Buffer | null = null
    if (Buffer.isBuffer(data)) {
      toAppend = data
    } else {
      toAppend = Buffer.from(data, 'utf8')
    }
    if (this.buffer.length - this.index >= toAppend.length) {
      toAppend.copy(this.buffer, this.index, 0, toAppend.length)
    } else {
      const newSize = (Math.ceil((this.index + toAppend.length) / defaultSize) + 1) * defaultSize
      if (this.index === 0) {
        this.buffer = Buffer.allocUnsafe(newSize)
        toAppend.copy(this.buffer, 0, 0, toAppend.length)
      } else {
        this.buffer = Buffer.concat([this.buffer.slice(0, this.index), toAppend], newSize)
      }
    }
    this.index += toAppend.length
  }

  public tryReadContentLength(): number {
    let result = -1
    let current = 0
    // we are utf8 encoding...
    while (current < this.index && (this.buffer[current] === blank || this.buffer[current] === backslashR || this.buffer[current] === backslashN)) {
      current++
    }
    if (this.index < current + contentLengthSize) {
      return result
    }
    current += contentLengthSize
    const start = current
    while (current < this.index && this.buffer[current] !== backslashR) {
      current++
    }
    if (current + 3 >= this.index || this.buffer[current + 1] !== backslashN || this.buffer[current + 2] !== backslashR || this.buffer[current + 3] !== backslashN) {
      return result
    }
    const data = this.buffer.toString('utf8', start, current)
    result = parseInt(data)
    this.buffer = this.buffer.slice(current + 4)
    this.index = this.index - (current + 4)
    return result
  }

  public tryReadContent(length: number): string | null {
    if (this.index < length) {
      return null
    }
    const result = this.buffer.toString('utf8', 0, length)
    let sourceStart = length
    while (sourceStart < this.index && (this.buffer[sourceStart] === backslashR || this.buffer[sourceStart] === backslashN)) {
      sourceStart++
    }
    this.buffer.copy(this.buffer, 0, sourceStart)
    this.index = this.index - sourceStart
    return result
  }
}

class Reader<T> extends Disposable {

  private readonly buffer: ProtocolBuffer = new ProtocolBuffer();
  private nextMessageLength: number = -1;

  public constructor(readable: Readable) {
    super()
    readable.on('data', data => this.onLengthData(data))
  }

  private readonly _onError = this._register(new Emitter<Error>());
  public readonly onError = this._onError.event;

  private readonly _onData = this._register(new Emitter<T>());
  public readonly onData = this._onData.event

  private onLengthData(data: Buffer | string): void {
    if (this.isDisposed) {
      return
    }

    try {
      this.buffer.append(data)
      while (true) {
        if (this.nextMessageLength === -1) {
          this.nextMessageLength = this.buffer.tryReadContentLength()
          if (this.nextMessageLength === -1) {
            return
          }
        }
        const msg = this.buffer.tryReadContent(this.nextMessageLength)
        if (msg === null) {
          return
        }
        this.nextMessageLength = -1
        const json = JSON.parse(msg)
        this._onData.fire(json)
      }
    } catch (e) {
      this._onError.fire(e)
    }
  }
}

function generatePatchedEnv(env: any, modulePath: string): any {
  const newEnv = Object.assign({}, env)

  // newEnv['ELECTRON_RUN_AS_NODE'] = '1'
  newEnv['NODE_PATH'] = path.join(modulePath, '..', '..', '..')

  // Ensure we always have a PATH set
  newEnv['PATH'] = newEnv['PATH'] || process.env.PATH

  return newEnv
}

function getExecArgv(kind: TsServerProcessKind, configuration: TypeScriptServiceConfiguration): string[] {
  const args: string[] = []

  const debugPort = getDebugPort(kind)
  if (debugPort) {
    const inspectFlag = getTssDebugBrk() ? '--inspect-brk' : '--inspect'
    args.push(`${inspectFlag}=${debugPort}`)
  }

  if (configuration.maxTsServerMemory) {
    args.push(`--max-old-space-size=${configuration.maxTsServerMemory}`)
  }

  return args
}

function getDebugPort(kind: TsServerProcessKind): number | undefined {
  if (kind === TsServerProcessKind.Syntax) {
    // We typically only want to debug the main semantic server
    return undefined
  }
  const value = getTssDebugBrk() || getTssDebug()
  if (value) {
    const port = parseInt(value)
    if (!isNaN(port)) {
      return port
    }
  }
  return undefined
}

function getTssDebug(): string | undefined {
  return process.env[process.env.remoteName ? 'TSS_REMOTE_DEBUG' : 'TSS_DEBUG']
}

function getTssDebugBrk(): string | undefined {
  return process.env[process.env.remoteName ? 'TSS_REMOTE_DEBUG_BRK' : 'TSS_DEBUG_BRK']
}

class SocketChildServerProcess extends Disposable implements TsServerProcess {
  private readonly _reader: Reader<Proto.Response>
  constructor(
    private readonly socket: Socket
  ) {
    super()
    this._reader = this._register(new Reader<Proto.Response>(socket))
  }

  write(serverRequest: Proto.Request): void {
    this.socket.write(JSON.stringify(serverRequest) + '\r\n', 'utf8')
  }

  onData(handler: (data: Proto.Response) => void): void {
    this._reader.onData(handler)
  }

  onExit(handler: (code: number | null, signal: string | null) => void): void {
    this.socket.on('close', hadError => {
      if (hadError) handler(null, null)
    })
  }

  onError(handler: (err: Error) => void): void {
    this.socket.on('error', handler)
    this._reader.onError(handler)
  }

  kill(): void {
    // can't kill
  }
}

class IpcChildServerProcess extends Disposable implements TsServerProcess {
  constructor(
    private readonly _process: child_process.ChildProcess,
  ) {
    super()
  }

  write(serverRequest: Proto.Request): void {
    this._process.send(serverRequest)
  }

  onData(handler: (data: Proto.Response) => void): void {
    this._process.on('message', handler)
  }

  onExit(handler: (code: number | null, signal: string | null) => void): void {
    this._process.on('exit', handler)
  }

  onError(handler: (err: Error) => void): void {
    this._process.on('error', handler)
  }

  kill(): void {
    this._process.kill()
  }
}

class StdioChildServerProcess extends Disposable implements TsServerProcess {
  private readonly _reader: Reader<Proto.Response>

  constructor(
    private readonly _process: child_process.ChildProcess,
  ) {
    super()
    this._reader = this._register(new Reader<Proto.Response>(this._process.stdout!))
  }

  write(serverRequest: Proto.Request): void {
    this._process.stdin!.write(JSON.stringify(serverRequest) + '\r\n', 'utf8')
  }

  onData(handler: (data: Proto.Response) => void): void {
    this._reader.onData(handler)
  }

  onExit(handler: (code: number | null, signal: string | null) => void): void {
    this._process.on('exit', handler)
  }

  onError(handler: (err: Error) => void): void {
    this._process.on('error', handler)
    this._reader.onError(handler)
  }

  kill(): void {
    this._process.kill()
    this._reader.dispose()
  }
}

export class ServiceProcessFactory implements TsServerProcessFactory {
  fork(
    version: TypeScriptVersion,
    args: readonly string[],
    kind: TsServerProcessKind,
    configuration: TypeScriptServiceConfiguration,
  ): TsServerProcess {
    if (configuration.socketPath) {
      let client = new Socket()
      let parts = configuration.socketPath.split(':')
      if (parts.length > 1) {
        let port = parseInt(parts[1])
        if (Number.isNaN(port)) throw new Error(`Invalid socketPath ${configuration.socketPath}`)
        client.connect(port, parts[0])
      } else {
        let port = parseInt(parts[0])
        if (Number.isNaN(port)) throw new Error(`Invalid socketPath ${configuration.socketPath}`)
        client.connect(port, '127.0.0.1')
      }
      return new SocketChildServerProcess(client)
    }
    let tsServerPath = version.tsServerPath
    const useIpc = version.version?.gte(API.v460)
    const runtimeArgs = [...args]
    if (useIpc) {
      runtimeArgs.push('--useNodeIpc')
    }

    const childProcess = child_process.fork(tsServerPath, runtimeArgs, {
      silent: true,
      cwd: undefined,
      env: generatePatchedEnv(process.env, tsServerPath),
      execArgv: getExecArgv(kind, configuration),
      stdio: useIpc ? ['pipe', 'pipe', 'pipe', 'ipc'] : undefined,
    })

    return useIpc ? new IpcChildServerProcess(childProcess) : new StdioChildServerProcess(childProcess)
  }
}
