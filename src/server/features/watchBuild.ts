import { ChildProcess, spawn } from 'child_process'
import { disposeAll, StatusBarItem, workspace } from 'coc.nvim'
import { Command, CommandManager } from 'coc.nvim/lib/commands'
import findUp from 'find-up'
import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { Disposable, Location } from 'vscode-languageserver-protocol'
import Uri from 'vscode-uri'
import which from 'which'
import { resolveRoot } from '../utils/fs'

const TSC = './node_modules/.bin/tsc'
const countRegex = /Found\s+(\d+)\s+error/
const errorRegex = /^(.+)\((\d+),(\d+)\):\s(\w+)\sTS(\d+):\s*(.+)$/

interface ErrorItem {
  location: Location
  text: string
  type: string
}

enum TscStatus {
  INIT,
  COMPILING,
  RUNNING,
  ERROR,
}

class WatchCommand implements Command {
  public readonly id: string = 'tsserver.watchBuild'
  private statusItem: StatusBarItem
  private isRunning = false
  private process: ChildProcess

  constructor() {
    this.statusItem = workspace.createStatusBarItem(1, { progress: true })
  }

  private onStop(): void {
    let { nvim } = workspace
    this.isRunning = false
    nvim.setVar('Tsc_running', 0, true)
    this.statusItem.hide()
  }

  private onStart(): void {
    this.statusItem.text = 'compiling'
    this.statusItem.isProgress = true
    this.statusItem.show()
    workspace.nvim.call('setqflist', [[], 'r'], true)
  }

  private async start(cmd: string, args: string[], cwd: string): Promise<void> {
    if (this.isRunning) {
      this.process.kill()
      await wait(200)
    }
    this.isRunning = true
    workspace.nvim.setVar('Tsc_running', 1, true)
    this.process = spawn(cmd, args, { cwd })
    this.process.on('error', e => {
      workspace.showMessage(e.message, 'error')
    })
    const rl = readline.createInterface(this.process.stdout)
    this.process.on('exit', () => {
      this.onStop()
      rl.close()
    })
    this.process.stderr.on('data', chunk => {
      workspace.showMessage(chunk.toString('utf8'), 'error')
    })
    const startTexts = ['Starting compilation in watch mode', 'Starting incremental compilation']
    rl.on('line', line => {
      if (countRegex.test(line)) {
        let ms = line.match(countRegex)
        this.statusItem.text = ms[1] == '0' ? '✓' : '✗'
        this.statusItem.isProgress = false
      } else if (startTexts.findIndex(s => line.indexOf(s) !== -1) != -1) {
        this.onStart()
      } else {
        let ms = line.match(errorRegex)
        if (!ms) return
        let fullpath = path.join(cwd, ms[1])
        let uri = Uri.file(fullpath).toString()
        let doc = workspace.getDocument(uri)
        let bufnr = doc ? doc.bufnr : null
        let item = {
          filename: fullpath,
          lnum: Number(ms[2]),
          col: Number(ms[3]),
          text: `[tsc ${ms[5]}] ${ms[6]}`,
          type: /error/i.test(ms[4]) ? 'E' : 'W'
        } as any
        if (bufnr) item.bufnr = bufnr
        workspace.nvim.call('setqflist', [[item], 'a'])
      }
    })
  }

  public async execute(): Promise<void> {
    let docs = workspace.documents
    let idx = docs.findIndex(doc => doc.uri.indexOf(TSC) !== -1)
    if (idx !== -1) return
    let document = await workspace.document
    let fsPath = Uri.parse(document.uri).fsPath
    let cwd = path.dirname(fsPath)
    let res = findUp.sync(['node_modules'], { cwd })
    let cmd: string
    let root: string
    if (!res) {
      if (executable('tsc')) {
        cmd = 'tsc'
        root = workspace.cwd
      }
    } else {
      let file = path.join(path.dirname(res), 'node_modules/.bin/tsc')
      if (fs.existsSync(file)) {
        cmd = './node_modules/.bin/tsc'
        root = path.dirname(res)
      }
    }
    if (!cmd) {
      workspace.showMessage(`Local & global tsc not found`, 'error')
      return
    }
    let configRoot = resolveRoot(cwd, ['tsconfig.json'])
    if (!configRoot) {
      workspace.showMessage('tsconfig.json not found!', 'error')
      return
    }
    let configPath = path.relative(root, path.join(configRoot, 'tsconfig.json'))
    this.start(cmd, ['-p', configPath, '--watch', 'true', '--pretty', 'false'], root)
  }
}

export default class WatchProject implements Disposable {
  private disposables: Disposable[] = []

  public constructor(
    commandManager: CommandManager
  ) {
    let cmd = new WatchCommand()
    commandManager.register(cmd)
    let { nvim } = workspace
    nvim.getVar('Tsc_running').then(running => {
      if (running) {
        cmd.execute().catch(e => {
          workspace.showMessage('TSC:' + e.message, 'error')
        })
      }
    })
  }

  public dispose(): void {
    disposeAll(this.disposables)
  }
}

function executable(command: string): boolean {
  try {
    which.sync(command)
  } catch (e) {
    return false
  }
  return true
}

function wait(ms: number): Promise<any> {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve()
    }, ms)
  })
}
