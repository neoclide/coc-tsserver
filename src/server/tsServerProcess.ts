
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import cp from 'child_process'
import { Disposable } from 'vscode-languageserver-protocol'
import * as Proto from './protocol'
import { Reader } from './utils/wireProtocol'

export interface ToCancelOnResourceChanged {
  readonly resource: string
  cancel(): void
}

export default class ForkedTsServerProcess implements Disposable {
  private readonly _reader: Reader<Proto.Response>

  constructor(private childProcess: cp.ChildProcess) {
    this._reader = new Reader<Proto.Response>(this.childProcess.stdout)
  }

  public readonly toCancelOnResourceChange = new Set<ToCancelOnResourceChanged>()

  public onExit(cb: (err: any, signal: string) => void): void {
    this.childProcess.on('exit', cb)
  }

  public write(serverRequest: Proto.Request): void {
    this.childProcess.stdin.write(
      JSON.stringify(serverRequest) + '\r\n',
      'utf8'
    )
  }

  public onData(handler: (data: Proto.Response) => void): void {
    this._reader.onData(handler)
  }

  public onError(handler: (err: Error) => void): void {
    this.childProcess.on('error', handler)
    this._reader.onError(handler)
  }

  public kill(): void {
    this.toCancelOnResourceChange.clear()
    this.childProcess.kill()
    this._reader.dispose()
  }

  public dispose(): void {
    this.toCancelOnResourceChange.clear()
    this._reader.dispose()
  }
}
