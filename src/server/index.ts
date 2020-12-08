import { disposeAll, IServiceProvider, ServiceStat, workspace, WorkspaceConfiguration } from 'coc.nvim'
import { Disposable, DocumentSelector, Emitter, Event } from 'vscode-languageserver-protocol'
import { PluginManager } from '../utils/plugins'
import TypeScriptServiceClientHost from './typescriptServiceClientHost'
import { LanguageDescription, standardLanguageDescriptions } from './utils/languageDescription'

export default class TsserverService implements IServiceProvider {
  public id = 'tsserver'
  public name = 'tsserver'
  public enable: boolean
  // supported language types
  public selector: DocumentSelector
  public state = ServiceStat.Initial
  public clientHost: TypeScriptServiceClientHost
  private _onDidServiceReady = new Emitter<void>()
  public readonly onServiceReady: Event<void> = this._onDidServiceReady.event
  private readonly disposables: Disposable[] = []
  private descriptions: LanguageDescription[] = []

  constructor(private pluginManager: PluginManager) {
    const config = workspace.getConfiguration('tsserver')
    const enableJavascript = !!config.get<boolean>('enableJavascript')
    this.enable = config.get<boolean>('enable')
    this.descriptions = standardLanguageDescriptions.filter(o => {
      return enableJavascript ? true : o.id != 'javascript'
    })
    this.selector = this.descriptions.reduce((arr, c) => {
      return arr.concat(c.modeIds)
    }, [])
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

  public start(): Promise<void> {
    if (this.clientHost) return
    this.state = ServiceStat.Starting
    this.clientHost = new TypeScriptServiceClientHost(this.descriptions, this.pluginManager)
    this.disposables.push(this.clientHost)
    let client = this.clientHost.serviceClient
    return new Promise(resolve => {
      let started = false
      client.onTsServerStarted(() => {
        Object.defineProperty(this, 'state', {
          get: () => {
            return this.clientHost.serviceClient.state
          }
        })
        this._onDidServiceReady.fire(void 0)
        if (!started) {
          started = true
          resolve()
        }
      })
    })
  }

  public dispose(): void {
    disposeAll(this.disposables)
  }

  public async restart(): Promise<void> {
    if (!this.clientHost) return
    let client = this.clientHost.serviceClient
    await client.restartTsServer()
  }

  public async stop(): Promise<void> {
    if (!this.clientHost) return
    this.clientHost.reset()
    let client = this.clientHost.serviceClient
    await client.stop()
    return
  }
}
