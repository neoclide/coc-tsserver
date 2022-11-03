import { CancellationToken, Disposable, disposeAll, Logger, StatusBarItem, TaskOptions, Uri, window, workspace } from 'coc.nvim'
import path from 'path'
import type * as Proto from './protocol'
import type TsserverService from '../server'
import { TypeScriptVersion } from './tsServer/versionProvider'
import fs from 'fs'
import { ServerResponse } from './typescriptService'
import TypeScriptServiceClient from './typescriptServiceClient'

const countRegex = /Found\s+(\d+)\s+error/
const errorRegex = /^(.+)\((\d+),(\d+)\):\s(\w+)\sTS(\d+):\s*(.+)$/

export default class WatchProject implements Disposable {
  private disposables: Disposable[] = []
  public static readonly id: string = 'tsserver.watchBuild'
  public static readonly startTexts: string[] = ['Starting compilation in watch mode', 'Starting incremental compilation']
  private statusItem: StatusBarItem
  private task: any
  private options: TaskOptions

  public constructor(
    private readonly service: TsserverService,
    private readonly logger: Logger
  ) {
    this.statusItem = window.createStatusBarItem(1, { progress: true })
    this.disposables.push(this.statusItem)
    let task = this.task = workspace.createTask('TSC')

    task.onExit(code => {
      if (code != 0) {
        window.showWarningMessage(`TSC exit with code ${code}`)
      }
      this.onStop()
    })
    task.onStdout(lines => {
      for (let line of lines) {
        this.onLine(line)
      }
    })
    task.onStderr(lines => {
      window.showErrorMessage(`TSC error: ` + lines.join('\n'))
    })
    this.disposables.push(Disposable.create(() => {
      task.dispose()
    }))
    this.check().catch(_e => {
      // noop
    })
  }

  public async execute(): Promise<void> {
    let opts = this.options = await this.getOptions()
    if (!opts) return
    await this.start(opts)
  }

  private async check(): Promise<void> {
    let running = await this.task.running
    if (running) {
      this.options = await this.getOptions()
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
    this.statusItem.hide()
  }

  private onStart(): void {
    this.statusItem.text = 'compiling'
    this.statusItem.isProgress = true
    this.statusItem.show()
    workspace.nvim.call('setqflist', [[]], true)
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

  public async getOptions(): Promise<TaskOptions> {
    let doc = await workspace.document
    let resource = Uri.parse(doc.uri)
    const client = await this.service.getClientHost()
    let { serviceClient } = client
    const file = serviceClient.toPath(resource.toString())
    if (!file) {
      window.showWarningMessage('Could not determine TypeScript or JavaScript project. Current file should be javascript or typescript file.')
      return
    }
    let version: TypeScriptVersion
    const rootPath = serviceClient.getWorkspaceRootForResource(resource)
    if (!rootPath) {
      window.showWarningMessage(`Could not determine workspace folder for current file ${doc.uri}.`)
      return
    }
    version = serviceClient.versionProvider.getLocalVersionFromFolder(rootPath)
    if (!version) version = serviceClient.versionProvider.getLocalVersion()
    if (!version) version = serviceClient.versionManager.currentVersion
    if (!version) {
      window.showErrorMessage(`Unable to resolve typescript module from workspace folders`)
      return
    }
    let tsconfigPath: string
    let configFileName = await resolveConfigFile(serviceClient, file)
    if (configFileName) {
      tsconfigPath = path.relative(rootPath, configFileName)
    } else {
      this.logger.warn(`Unable to resolve config file from ${file}, try configuration`)
      let inspect = workspace.getConfiguration('tsserver', doc.uri).inspect<string>('tsconfigPath')
      let value = inspect ? inspect.workspaceFolderValue || inspect.workspaceValue || 'tsconfig.json' : 'tsconfig.json'
      let fullpath = path.join(rootPath, value)
      if (fs.existsSync(fullpath)) {
        tsconfigPath = value
      } else {
        window.showWarningMessage(`Config file ${fullpath} not exists.`)
        return
      }
    }

    return {
      cmd: version.tscPath,
      args: ['-p', tsconfigPath, '--watch', 'true', '--pretty', 'false'],
      cwd: rootPath
    }
  }

  public dispose(): void {
    disposeAll(this.disposables)
  }
}

async function resolveConfigFile(client: TypeScriptServiceClient, file: string): Promise<string | undefined> {
  let res: ServerResponse.Response<Proto.ProjectInfoResponse> | undefined
  try {
    res = await client.execute('projectInfo', { file, needFileNameList: false }, CancellationToken.None)
  } catch {
    // noop
  }
  if (res?.type !== 'response' || !res.body) {
    return undefined
  }
  let { configFileName } = res.body
  // inferred project
  if (configFileName && configFileName.startsWith('/dev/null')) return undefined
  return configFileName
}
