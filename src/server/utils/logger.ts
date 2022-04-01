import { OutputChannel, window } from 'coc.nvim'
import * as is from './is'

export default class Logger {

  private _channel: OutputChannel

  private get output(): OutputChannel {
    if (this._channel) {
      return this._channel
    }
    this._channel = window.createOutputChannel('tsserver')
    return this._channel
  }

  public dispose(): void {
    if (this._channel) {
      this._channel.dispose()
    }
  }

  private data2String(data: any): string {
    if (data instanceof Error) {
      if (is.string(data.stack)) {
        return data.stack
      }
      return (data as Error).message
    }
    if (is.boolean(data.success) && !data.success && is.string(data.message)) {
      return data.message
    }
    if (is.string(data)) {
      return data
    }
    return data.toString()
  }

  public info(message: string, data?: any): void {
    this.logLevel('Info', message, data)
  }

  public warn(message: string, data?: any): void {
    this.logLevel('Warn', message, data)
  }

  public error(message: string, data?: any): void {
    // See https://github.com/Microsoft/TypeScript/issues/10496
    if (data && data.message === 'No content available.') {
      return
    }
    this.logLevel('Error', message, data)
  }

  private now(): string {
    const now = new Date()
    return padLeft(now.getUTCHours() + '', 2, '0')
      + ':' + padLeft(now.getMinutes() + '', 2, '0')
      + ':' + padLeft(now.getUTCSeconds() + '', 2, '0') + '.' + now.getMilliseconds()
  }

  public logLevel(level: string, message: string, data?: any): void {
    this.output.appendLine(
      `[${level}  - ${this.now()}] ${message}`
    )
    if (data) {
      this.output.appendLine(this.data2String(data))
    }
  }
}


function padLeft(s: string, n: number, pad = ' ') {
  return pad.repeat(Math.max(0, n - s.length)) + s
}
