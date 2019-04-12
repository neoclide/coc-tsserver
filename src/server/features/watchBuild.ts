import { ChildProcess, spawn } from 'child_process'
import { disposeAll, StatusBarItem, workspace, TaskOptions } from 'coc.nvim'
import { Command, CommandManager } from 'coc.nvim/lib/commands'
import findUp from 'find-up'
import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { Disposable, Location } from 'vscode-languageserver-protocol'
import Uri from 'vscode-uri'
import which from 'which'
import { resolveRoot } from '../utils/fs'
import Task from 'coc.nvim/lib/model/task'

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

export default class WatchProject implements Disposable {
  private disposables: Disposable[] = []
  public static readonly id: string = 'tsserver.watchBuild'
  public static readonly startTexts: string[] = ['Starting compilation in watch mode', 'Starting incremental compilation']
  private statusItem: StatusBarItem
  private isRunning = false
  private task: Task
  private options: TaskOptions

  public constructor(
    commandManager: CommandManager
  ) {
    this.statusItem = workspace.createStatusBarItem(1, { progress: true })
    let task = this.task = workspace.createTask('TSC')
    this.options = this.getOptions()
    this.disposables.push(commandManager.registerCommand(WatchProject.id, async () => {
      await this.start(this.options)
    }))
    task.onExit(code => {
      if (code != 0) {
        workspace.showMessage(`TSC exit with code ${code}`, 'warning')
      }
      this.onStop()
    })
    task.onStdout(lines => {
      for (let line of lines) {
        this.onLine(line)
      }
    })
    task.onStderr(lines => {
      workspace.showMessage(`TSC error: ` + lines.join('\n'), 'error')
    })
    this.disposables.push(Disposable.create(() => {
      task.dispose()
    }))
    this.check().catch(_e => {
      // noop
    })
  }

  private async check(): Promise<void> {
    let running = await this.task.running
    if (running) {
      this.statusItem.isProgress = false
      this.statusItem.text = '?'
      this.statusItem.show()
    } else {
      this.onStop()
    }
  }

  private async start(options: TaskOptions): Promise<void> {
    await this.task.start(options)
  }

  private onStop(): void {
    let { nvim } = workspace
    this.isRunning = false
    this.statusItem.hide()
  }

  private onStart(): void {
    this.statusItem.text = 'compiling'
    this.statusItem.isProgress = true
    this.statusItem.show()
    workspace.nvim.call('setqflist', [[], 'r'], true)
  }

  private onLine(line: string): void {
    if (countRegex.test(line)) {
      let ms = line.match(countRegex)
      this.statusItem.text = ms[1] == '0' ? '✓' : '✗'
      this.statusItem.isProgress = false
    } else if (WatchProject.startTexts.findIndex(s => line.indexOf(s) !== -1) != -1) {
      this.onStart()
    } else {
      let ms = line.match(errorRegex)
      if (!ms) return
      let fullpath = path.join(this.options.cwd, ms[1])
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
  }

  public getOptions(): TaskOptions {
    let docs = workspace.documents
    let idx = docs.findIndex(doc => doc.uri.indexOf(TSC) !== -1)
    if (idx !== -1) return
    let doc = workspace.getDocument(workspace.bufnr)
    let cwd: string
    if (doc && doc.schema == 'file') {
      cwd = path.dirname(Uri.parse(doc.uri).fsPath)
    } else {
      cwd = workspace.cwd
    }
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
    return {
      cmd,
      args: ['-p', configPath, '--watch', 'true', '--pretty', 'false'],
      cwd: root
    }
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
