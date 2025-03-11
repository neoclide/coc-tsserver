import { CancellationToken, commands, Diagnostic, Disposable, QuickPickItem, ServiceStat, Uri as URI, window, workspace } from 'coc.nvim'
import path from 'path'
import { Location, Position, Range, TextEdit } from 'vscode-languageserver-types'
import TsserverService from '../server'
import { PluginManager } from '../utils/plugins'
import { Resolver } from '../utils/resolver'
import * as Proto from './protocol'
import { TypeScriptVersion } from './tsServer/versionProvider'
import TypeScriptServiceClientHost from './typescriptServiceClientHost'
import API from './utils/api'
import { nodeModules } from './utils/helper'
import { installModules } from './utils/modules'
import * as typeConverters from './utils/typeConverters'

export interface Command {
  readonly id: string | string[]
  execute(...args: any[]): void | Promise<any>
}

interface PickItem extends QuickPickItem {
  version: TypeScriptVersion
}

export class ChooseVersionCommand implements Command {
  public readonly id = 'tsserver.chooseVersion'
  private resolver = new Resolver()

  public constructor(
    private readonly service: TsserverService
  ) {}

  public async execute(): Promise<void> {
    let client = await this.service.getClientHost()
    let { versionProvider } = client.serviceClient
    let { bundledVersion } = versionProvider

    let npmServerPath: string
    let yarnServerPath: string
    let config = workspace.getConfiguration('tsserver', URI.file(workspace.root))
    if (config.inspect('useLocalTsdk').globalValue !== true) {
      // not resolve when useLocalTsdk
      await window.withProgress({
        title: 'Resolving typescript module'
      }, async () => {
        npmServerPath = await this.resolver.resolveNpm()
        yarnServerPath = await this.resolver.resolveYarn()
      })
    }
    let currPath = client.serviceClient.versionManager.currentVersion?.path
    let items: PickItem[] = []
    items.push({
      label: bundledVersion.version.displayName,
      description: 'Bundled with coc-tsserver',
      version: bundledVersion,
      picked: bundledVersion.path == currPath
    })
    if (npmServerPath) {
      let version = versionProvider.getVersionFromTscPath(npmServerPath)
      if (version && version.isValid) {
        items.push({
          label: version.version.displayName,
          description: 'From npm',
          version: version,
          picked: version.path == currPath
        })
      }
    }
    if (yarnServerPath) {
      let version = versionProvider.getVersionFromTscPath(yarnServerPath)
      if (version && version.isValid) {
        items.push({
          label: version.version.displayName,
          description: 'From yarn',
          version: version,
          picked: version.path == currPath
        })
      }
    }
    let localVersion = versionProvider.getLocalVersion()
    if (localVersion) {
      items.push({
        label: localVersion.version.displayName,
        description: 'Local version',
        version: localVersion,
        picked: localVersion.path == currPath
      })
    }
    let workspaceVersion = versionProvider.getLocalVersionFromFolder(workspace.root)
    if (workspaceVersion && workspaceVersion.tscPath != localVersion?.tscPath) {
      items.push({
        label: workspaceVersion.version.displayName,
        description: 'Local workspace version',
        version: workspaceVersion,
        picked: workspaceVersion.path == currPath
      })
    }

    let res = await window.showQuickPick(items, { title: 'Choose typescript version', matchOnDescription: true })
    // not changed
    if (!res || res.version.path == currPath) return
    let libPath = path.relative(workspace.root, res.version.path)
    let isLocal = !libPath.startsWith('..')
    if (isLocal) {
      config.update('useLocalTsdk', true, 3 as any)
      config.update('tsdk', '${workspaceFolder}/' + libPath.replace(/\\/g, '/'), 3 as any)
      client.serviceClient.restartTsServer()
    } else {
      if (config.inspect('useLocalTsdk').workspaceFolderValue !== undefined) {
        config.update('useLocalTsdk', undefined, 3 as any)
      }
      if (config.inspect('tsdk').workspaceFolderValue !== undefined) {
        config.update('tsdk', undefined, 3 as any)
      }
      config.update('tsdk', res.version.path, 1 as any)
      void window.showInformationMessage(`Updated user configuration "tsserver.tsdk" to ${res.version.path}`)
      client.serviceClient.restartTsServer()
    }
  }
}


export class ReloadProjectsCommand implements Command {
  public readonly id = 'tsserver.reloadProjects'

  public constructor(
    private readonly service: TsserverService
  ) {}

  public async execute(): Promise<void> {
    let client = await this.service.getClientHost()
    client.reloadProjects()
    window.showInformationMessage('projects reloaded')
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
    window.showWarningMessage('Could not determine TypeScript or JavaScript project.')
    return
  }
  const { configFileName } = res.body
  if (configFileName && !isImplicitProjectConfigFile(configFileName)) {
    await workspace.openResource(URI.file(configFileName).toString())
    return
  }
  window.showWarningMessage('Config file not found')
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
    let handles = await client.handles(document.uri)
    if (!handles) {
      throw new Error(`Document ${document.uri} is not handled by tsserver.`)
      return
    }
    let file = client.serviceClient.toPath(document.uri)
    let diagnostics = client.serviceClient.diagnosticsManager.getDiagnostics(document.uri)
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
            command = 'editor.action.organizeImport'
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

export class FileReferencesCommand implements Command {
  public readonly id = 'tsserver.findAllFileReferences'
  public static readonly minVersion = API.v420

  public constructor(
    private readonly service: TsserverService
  ) {}

  public async execute() {
    const client = await this.service.getClientHost()
    if (client.serviceClient.apiVersion.lt(FileReferencesCommand.minVersion)) {
      window.showErrorMessage('Find file references failed. Requires TypeScript 4.2+.')
      return
    }

    const doc = await workspace.document
    let { languageId } = doc.textDocument
    if (client.serviceClient.modeIds.indexOf(languageId) == -1) return

    const openedFiledPath = client.serviceClient.toOpenedFilePath(doc.uri)
    if (!openedFiledPath) return

    const response = await client.serviceClient.execute('fileReferences', { file: openedFiledPath }, CancellationToken.None)
    if (response.type !== 'response' || !response.body) return

    const locations: Location[] = (response as Proto.FileReferencesResponse).body.refs.map(r =>
      typeConverters.Location.fromTextSpan(client.serviceClient.toResource(r.file), r)
    )

    await commands.executeCommand('editor.action.showReferences', doc.uri, Position.create(0, 0), locations)
  }
}

export class SourceDefinitionCommand implements Command {
  public static readonly context = 'tsSupportsSourceDefinition'
  public static readonly minVersion = API.v470

  public readonly id = 'tsserver.goToSourceDefinition'

  public constructor(private readonly service: TsserverService) {}

  public async execute() {
    const client = await this.service.getClientHost()
    if (client.serviceClient.apiVersion.lt(SourceDefinitionCommand.minVersion)) {
      window.showErrorMessage('Go to Source Definition failed. Requires TypeScript 4.7+.')
      return
    }

    const { document, position } = await workspace.getCurrentState()
    if (client.serviceClient.modeIds.indexOf(document.languageId) == -1) {
      window.showErrorMessage('Go to Source Definition failed. Unsupported file type.')
      return
    }
    const openedFiledPath = client.serviceClient.toOpenedFilePath(document.uri)
    if (!openedFiledPath) {
      window.showErrorMessage('Go to Source Definition failed. Unknown file type.')
      return
    }

    await window.withProgress({ title: 'Finding source definitions' }, async (_progress, token) => {

      const args = typeConverters.Position.toFileLocationRequestArgs(openedFiledPath, position)
      const response = await client.serviceClient.execute('findSourceDefinition', args, token)
      if (response.type === 'response' && response.body) {
        const locations: Location[] = (response as Proto.DefinitionResponse).body.map(reference =>
          typeConverters.Location.fromTextSpan(client.serviceClient.toResource(reference.file), reference))

        if (locations.length) {
          if (locations.length === 1) {
            await workspace.jumpTo(locations[0].uri, locations[0].range.start)
          } else {
            commands.executeCommand('editor.action.showReferences', document.uri, position, locations)
          }
          return
        }
      }

      window.showErrorMessage('No source definitions found.')
    })
  }
}

export function registCommand(cmd: Command): Disposable {
  let { id, execute } = cmd
  return commands.registerCommand(id as string, execute, cmd)
}
