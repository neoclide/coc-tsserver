import { Disposable, Emitter, Event, commands, disposeAll, DocumentSelector, ExtensionContext, IServiceProvider, ServiceStat, wait, workspace, WorkspaceConfiguration } from 'coc.nvim'
import { PluginManager } from '../utils/plugins'
import { AutoFixCommand, Command, ConfigurePluginCommand, FileReferencesCommand, OpenTsServerLogCommand, ChooseVersionCommand, ReloadProjectsCommand, SourceDefinitionCommand, TypeScriptGoToProjectConfigCommand } from './commands'
import { OrganizeImportsCommand, SourceImportsCommand } from './organizeImports'
import WatchProject from './watchBuild'
import TypeScriptServiceClientHost from './typescriptServiceClientHost'
import { LanguageDescription, standardLanguageDescriptions } from './utils/languageDescription'

export default class TsserverService implements IServiceProvider {
  public id = 'tsserver'
  public name = 'tsserver'
  public enable: boolean
  // supported language types
  public selector: DocumentSelector
  public _state = ServiceStat.Initial
  public clientHost: TypeScriptServiceClientHost
  private _onDidServiceReady = new Emitter<void>()
  public readonly onServiceReady: Event<void> = this._onDidServiceReady.event
  private readonly disposables: Disposable[] = []
  private descriptions: LanguageDescription[] = []

  constructor(private pluginManager: PluginManager, private readonly context: ExtensionContext) {
    const config = workspace.getConfiguration('tsserver')
    this.enable = config.get<boolean>('enable')
    this.descriptions = standardLanguageDescriptions.filter(o => {
      return true
    })
    workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('tsserver')) {
        const config = workspace.getConfiguration('tsserver')
        let enable = this.enable
        this.enable = config.get<boolean>('enable', true)
        if (enable !== this.enable) {
          if (this.enable) {
            void this.start()
          } else {
            void this.stop()
          }
        }
      }
    })
    this.selector = this.descriptions.reduce((arr, c) => {
      return arr.concat(c.languageIds)
    }, [])
    this.registCommands()
  }

  private get subscriptions(): Disposable[] {
    return this.context.subscriptions
  }

  // public state = ServiceStat.Initial

  public get state(): ServiceStat {
    if (this.clientHost) {
      // console.log(this.clientHost.serviceClient.state)
      return this.clientHost.serviceClient.state
    }
    return this._state
  }

  private registCommands(): void {
    let { subscriptions } = this
    const registCommand = (cmd: Command): void => {
      let { id, execute } = cmd
      subscriptions.push(commands.registerCommand(id as string, execute, cmd))
    }
    let watchProject = new WatchProject(this, this.context.logger)
    subscriptions.push(watchProject)
    registCommand({
      id: WatchProject.id,
      execute: () => {
        return watchProject.execute()
      }
    })
    registCommand(new ChooseVersionCommand(this))
    registCommand(new ConfigurePluginCommand(this.pluginManager))
    registCommand(new AutoFixCommand(this))
    registCommand(new ReloadProjectsCommand(this))
    registCommand(new FileReferencesCommand(this))
    registCommand(new OpenTsServerLogCommand(this))
    registCommand(new TypeScriptGoToProjectConfigCommand(this))
    registCommand(new OrganizeImportsCommand(this))
    registCommand(new SourceImportsCommand(this))
    registCommand(new SourceDefinitionCommand(this))
    registCommand({
      id: 'tsserver.restart',
      execute: (): void => {
        this.restart()
      }
    })
  }

  public get config(): WorkspaceConfiguration {
    return workspace.getConfiguration('tsserver')
  }

  /**
   * Get running client host.
   */
  public getClientHost(): Promise<TypeScriptServiceClientHost> {
    if (this.state == ServiceStat.Running) return Promise.resolve(this.clientHost)
    this.start()
    return new Promise((resolve, reject) => {
      let timer = setTimeout(() => {
        reject(new Error(`Server not started after 5s`))
      }, 5000)
      let disposable = this.onServiceReady(() => {
        clearTimeout(timer)
        disposable.dispose()
        resolve(this.clientHost)
      })
    })
  }

  public async start(): Promise<void> {
    if (!this.enable || this._state == ServiceStat.Starting) return
    this._state = ServiceStat.Starting
    if (this.clientHost) {
      let client = this.clientHost.serviceClient
      client.restartTsServer(true)
      return
    }
    let tscPath = await workspace.nvim.getVar('Coc_tsserver_path') as string | null
    this.clientHost = new TypeScriptServiceClientHost(this.descriptions, this.pluginManager, tscPath, this.context)
    let client = this.clientHost.serviceClient
    await new Promise(resolve => {
      client.onReady(() => {
        this._onDidServiceReady.fire(void 0)
        resolve(undefined)
      })
    })
  }

  public async restart(): Promise<void> {
    if (!this.enable) return
    await this.stop()
    await this.start()
  }

  public async stop(): Promise<void> {
    if (!this.clientHost) return
    let client = this.clientHost.serviceClient
    client.stop()
    await wait(30)
    this.clientHost?.dispose()
    this.clientHost = null
    this._state = ServiceStat.Stopped
  }

  public dispose(): void {
    void this.stop()
    this._onDidServiceReady.dispose()
    disposeAll(this.disposables)
  }
}
