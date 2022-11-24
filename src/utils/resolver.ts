'use strict'
import { ChildProcess, exec, ExecOptions } from 'child_process'
import { CancellationError } from 'coc.nvim'
import fs from 'fs'
import path from 'path'
import stripAnsi from 'strip-ansi'
import which from 'which'

function resolveCommand(cmd: string): string {
  try {
    return which.sync(cmd)
  } catch (e) {
    // noop
  }
  return undefined
}

export function runCommand(cmd: string, opts: ExecOptions = {}, timeout?: number): Promise<string> {
  if (process.platform !== 'win32') {
    opts.shell = opts.shell || process.env.SHELL
  }
  opts.maxBuffer = 500 * 1024
  return new Promise<string>((resolve, reject) => {
    let timer: NodeJS.Timer
    let cp: ChildProcess
    if (timeout) {
      timer = setTimeout(() => {
        cp.kill('SIGKILL')
        reject(new CancellationError())
      }, timeout * 1000)
    }
    cp = exec(cmd, opts, (err, stdout, stderr) => {
      if (timer) clearTimeout(timer)
      if (err) {
        reject(new Error(`exited with ${err.code}\n${err}\n${stderr}`))
        return
      }
      resolve(stdout.toString())
    })
  })
}

const moduleName = 'typescript'

export class Resolver {
  private _npmFolder: string | undefined
  private _yarnFolder: string | undefined

  public get nodeFolder(): Promise<string> {
    if (this._npmFolder) return Promise.resolve(this._npmFolder)
    let cmd = resolveCommand('npm')
    if (!cmd) return Promise.resolve('')
    return runCommand(`${cmd} --loglevel silent root -g`, {}, 3000).then(root => {
      this._npmFolder = stripAnsi(root).trim()
      return this._npmFolder
    })
  }

  public get yarnFolder(): Promise<string> {
    if (this._yarnFolder) return Promise.resolve(this._yarnFolder)
    let cmd = resolveCommand('yarnpkg')
    if (!cmd) cmd = resolveCommand('yarn')
    if (!cmd) return Promise.resolve('')
    return runCommand(`${cmd} global dir`, {}, 3000).then(root => {
      let folder = path.join(stripAnsi(root).trim(), 'node_modules')
      let exists = fs.existsSync(folder)
      if (exists) this._yarnFolder = folder
      return exists ? folder : ''
    }).catch(() => {
      // yarn global had been removed since version 2
      // if yarn global dir return error then its version >=2, just return empty
      return ''
    })
  }

  public async resolveNpm(): Promise<string | undefined> {
    let folder = await this.nodeFolder
    return folder ? this.resolve(folder) : undefined
  }

  public async resolveYarn(): Promise<string | undefined> {
    let folder = await this.yarnFolder
    return folder ? this.resolve(folder) : undefined
  }

  private resolve(folder: string): string | undefined {
    let file = path.join(folder, moduleName, 'lib/tsserver.js')
    if (fs.existsSync(file)) return file
    return undefined
  }
}
