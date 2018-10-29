import { disposeAll, Document, QuickfixItem, workspace } from 'coc.nvim'
import { Command, CommandManager } from 'coc.nvim/lib/commands'
import fs from 'fs'
import path from 'path'
import { Disposable, Location, Range } from 'vscode-languageserver-protocol'
import Uri from 'vscode-uri'
import { resolveRoot } from '../utils/fs'

const TSC = './node_modules/.bin/tsc'
const countRegex = /Found\s(\d+)\serror/
const startRegex = /File\s+change\s+detected/
const errorRegex = /^(.+):(\d+):(\d+)\s-\s(\w+)\s+[A-Za-z]+(\d+):\s+(.*)$/

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

  private setStatus(state: TscStatus): void {
    let s = 'init'
    switch (state) {
      case TscStatus.COMPILING:
        s = 'compiling'
        break
      case TscStatus.RUNNING:
        s = 'running'
        break
      case TscStatus.ERROR:
        s = 'error'
        break
    }
    let { nvim } = workspace
    nvim.setVar('tsc_status', s, true)
    nvim.command('redraws')
  }

  public async execute(): Promise<void> {
    let docs = workspace.documents
    let idx = docs.findIndex(doc => doc.uri.indexOf(TSC) !== -1)
    if (idx !== -1) return
    let document = await workspace.document
    let fsPath = Uri.parse(document.uri).fsPath
    let cwd = path.dirname(fsPath)
    let dir = resolveRoot(cwd, ['node_modules'])
    if (dir) {
      let file = path.join(dir, 'node_modules/.bin/tsc')
      if (!fs.existsSync(file)) dir = null
    }
    if (!dir) {
      workspace.showMessage('typescript module not found!', 'error')
      return
    }
    let configRoot = resolveRoot(cwd, ['tsconfig.json'])
    if (!configRoot) {
      workspace.showMessage('tsconfig.json not found!', 'error')
      return
    }
    let configPath = path.relative(dir, path.join(configRoot, 'tsconfig.json'))
    let cmd = `${TSC} -p ${configPath} --watch true`
    await workspace.nvim.call('coc#util#open_terminal', {
      keepfocus: 1,
      cwd: dir,
      cmd
    })
  }

  public async onTerminalCreated(doc: Document): Promise<void> {
    let items: ErrorItem[] = []
    let cwd = await doc.getcwd()
    if (!cwd) return
    this.setStatus(TscStatus.RUNNING)
    let parseLine = async (line: string): Promise<void> => {
      if (startRegex.test(line)) {
        this.setStatus(TscStatus.COMPILING)
      } else if (errorRegex.test(line)) {
        let ms = line.match(errorRegex)
        let lnum = Number(ms[2]) - 1
        let character = Number(ms[3]) - 1
        let range = Range.create(lnum, character, lnum, character)
        let uri = Uri.file(path.join(cwd, ms[1])).toString()
        let location = Location.create(uri, range)
        let item: ErrorItem = {
          location,
          text: `[tsc ${ms[5]}] ${ms[6]}`,
          type: /error/.test(ms[4]) ? 'E' : 'W'
        }
        items.push(item)
      } else if (countRegex.test(line)) {
        let ms = line.match(countRegex)
        if (ms[1] == '0' || items.length == 0) {
          this.setStatus(TscStatus.RUNNING)
          return
        }
        this.setStatus(TscStatus.ERROR)
        let qfItems: QuickfixItem[] = []
        for (let item of items) {
          let o = await workspace.getQuickfixItem(item.location, item.text, item.type)
          qfItems.push(o)
        }
        items = []
        let { nvim } = workspace
        await nvim.call('setqflist', [[], ' ', { title: 'Results of tsc', items: qfItems }])
        await nvim.command('doautocmd User CocQuickfixChange')
      }
    }
    for (let line of doc.content.split('\n')) {
      parseLine(line)
    }
    doc.onDocumentChange(e => {
      let { contentChanges } = e
      for (let change of contentChanges) {
        let lines = change.text.split('\n')
        for (let line of lines) {
          parseLine(line)
        }
      }
    })
  }
}

export default class WatchProject implements Disposable {
  private disposables: Disposable[] = []
  public constructor(
    commandManager: CommandManager
  ) {
    let cmd = new WatchCommand()
    commandManager.register(cmd)
    this.disposables.push(Disposable.create(() => {
      commandManager.unregister(cmd.id)
    }))
    workspace.documents.forEach(doc => {
      let { uri } = doc
      if (this.isTscBuffer(uri)) {
        cmd.onTerminalCreated(doc).catch(_e => {
          // noop
        })
      }
    })
    workspace.onDidOpenTextDocument(doc => {
      let { uri } = doc
      if (this.isTscBuffer(uri)) {
        cmd.onTerminalCreated(workspace.getDocument(uri)).catch(_e => {
          // noop
        })
      }
    }, this, this.disposables)
    workspace.onDidCloseTextDocument(doc => {
      let { uri } = doc
      if (this.isTscBuffer(uri)) {
        workspace.nvim.setVar('tsc_status', 'init', true)
        workspace.nvim.command('redraws')
      }
    }, this, this.disposables)
  }

  private isTscBuffer(uri: string): boolean {
    return uri.startsWith('term://') && uri.indexOf(TSC) !== -1
  }

  public dispose(): void {
    disposeAll(this.disposables)
  }
}
