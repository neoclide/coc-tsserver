import { commands, diagnosticManager, CancellationToken, Diagnostic, Disposable, ServiceStat, Uri as URI, window, workspace } from 'coc.nvim'
import { Range, TextEdit } from 'vscode-languageserver-types'
import TsserverService from '../server'
import { PluginManager } from '../utils/plugins'
import * as Proto from './protocol'
import TypeScriptServiceClientHost from './typescriptServiceClientHost'
import { nodeModules } from './utils/helper'
import { installModules } from './utils/modules'
import * as typeConverters from './utils/typeConverters'

export interface Command {
  readonly id: string | string[]
  execute(...args: any[]): void | Promise<any>
}

export class ReloadProjectsCommand implements Command {
  public readonly id = 'tsserver.reloadProjects'

  public constructor(
    private readonly service: TsserverService
  ) {}

  public async execute(): Promise<void> {
    let client = await this.service.getClientHost()
    client.reloadProjects()
    window.showMessage('projects reloaded')
  }
}

export class OpenTsServerLogCommand implements Command {
  public readonly id = 'tsserver.openTsServerLog'

  public constructor(
    private readonly service: TsserverService
  ) {}

  public async execute(): Promise<void> {
    let client = await this.service.getClientHost()
    client.serviceClient.openTsServerLogFile() // tslint:disable-line
  }
}

export class TypeScriptGoToProjectConfigCommand implements Command {
  public readonly id = 'tsserver.goToProjectConfig'

  public constructor(
    private readonly service: TsserverService
  ) {}

  public async execute(): Promise<void> {
    let client = await this.service.getClientHost()
    let doc = await workspace.document
    let { languageId } = doc.textDocument
    if (client.serviceClient.modeIds.indexOf(languageId) == -1) {
      throw new Error(`Could not determine TypeScript or JavaScript project. Unsupported file type: ${languageId}`)
      return
    }
    await goToProjectConfig(client, doc.uri)
  }
}

async function goToProjectConfig(clientHost: TypeScriptServiceClientHost, uri: string): Promise<void> {
  const client = clientHost.serviceClient
  const file = client.toPath(uri)
  let res
  try {
    res = await client.execute('projectInfo', { file, needFileNameList: false }, CancellationToken.None)
  } catch {
    // noop
  }
  if (!res || !res.body) {
    window.showMessage('Could not determine TypeScript or JavaScript project.', 'warning')
    return
  }
  const { configFileName } = res.body
  if (configFileName && !isImplicitProjectConfigFile(configFileName)) {
    await workspace.openResource(URI.file(configFileName).toString())
    return
  }
  window.showMessage('Config file not found', 'warning')
}

function isImplicitProjectConfigFile(configFileName: string): boolean {
  return configFileName.indexOf('/dev/null/') === 0
}

const autoFixableDiagnosticCodes = new Set<number>([
  2420, // Incorrectly implemented interface
  2552, // Cannot find name
  2304, // Cannot find name
])

export class AutoFixCommand implements Command {
  public readonly id = 'tsserver.executeAutofix'

  constructor(private service: TsserverService) {
  }

  public async execute(): Promise<void> {
    if (this.service.state != ServiceStat.Running) {
      throw new Error('service not running')
      return
    }
    let client = await this.service.getClientHost()
    let document = await workspace.document
    let handles = await client.handles(document.textDocument)
    if (!handles) {
      throw new Error(`Document ${document.uri} is not handled by tsserver.`)
      return
    }
    let file = client.serviceClient.toPath(document.uri)
    let diagnostics = diagnosticManager.getDiagnostics(document.uri).slice() as Diagnostic[]
    let missingDiagnostics = diagnostics.filter(o => o.code == 2307)
    if (missingDiagnostics.length) {
      let names = missingDiagnostics.map(o => {
        let ms = o.message.match(/module\s'(.+)'\./)
        return ms ? ms[1] : null
      })
      names = names.filter(s => s != null)
      if (names.length) {
        installModules(document.uri, names).catch(e => {
          console.error(e.message) // tslint:disable-line
        })
      }
    }
    diagnostics = diagnostics.filter(x => autoFixableDiagnosticCodes.has(x.code as number))
    if (diagnostics.length == 0) return
    diagnostics = diagnostics.reduce((arr, curr) => {
      if (curr.code == 2304 && arr.findIndex(o => o.message == curr.message) != -1) return arr
      arr.push(curr)
      return arr
    }, [] as Diagnostic[])
    let edits: TextEdit[] = []
    let command: string
    let names: string[] = []
    for (let diagnostic of diagnostics) {
      const args: Proto.CodeFixRequestArgs = {
        ...typeConverters.Range.toFileRangeRequestArgs(file, diagnostic.range),
        errorCodes: [+(diagnostic.code!)]
      }
      const response = await client.serviceClient.execute('getCodeFixes', args, CancellationToken.None)
      if (response.type !== 'response' || !response.body || response.body.length < 1) {
        if (diagnostic.code == 2304) {
          let { range } = diagnostic
          let line = document.getline(range.start.line)
          let name = line.slice(range.start.character, range.end.character)
          if (nodeModules.indexOf(name) !== -1 && names.indexOf(name) == -1) {
            names.push(name)
            edits.push({
              range: Range.create(0, 0, 0, 0),
              newText: `import ${name} from '${name}'\n`
            })
            command = 'tsserver.organizeImports'
          }
        }
        continue
      }
      const fix = response.body[0]
      for (let change of fix.changes) {
        if (change.fileName != file) continue
        // change.fileName
        for (let ch of change.textChanges) {
          edits.push({
            range: typeConverters.Range.fromTextSpan(ch),
            newText: ch.newText
          })
        }
      }
    }
    if (edits.length) await document.applyEdits(edits)
    if (command) commands.executeCommand(command)
  }
}

export class ConfigurePluginCommand implements Command {
  public readonly id = '_typescript.configurePlugin'

  public constructor(
    private readonly pluginManager: PluginManager,
  ) {}

  public execute(pluginId: string, configuration: any): void {
    this.pluginManager.setConfiguration(pluginId, configuration)
  }
}

export function registCommand(cmd: Command): Disposable {
  let { id, execute } = cmd
  return commands.registerCommand(id as string, execute, cmd)
}
