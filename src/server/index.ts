import { disposeAll, IServiceProvider, ServiceStat, workspace, WorkspaceConfiguration } from 'coc.nvim'
import { Disposable, DocumentSelector, Emitter, Event } from 'vscode-languageserver-protocol'
import URI from 'vscode-uri'
import TypeScriptServiceClientHost from './typescriptServiceClientHost'
import { LanguageDescription, standardLanguageDescriptions } from './utils/languageDescription'

function wait(ms: number): Promise<any> {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve()
    }, ms)
  })
}

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

  constructor() {
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

  public start(): Promise<void> {
    this.state = ServiceStat.Starting
    this.clientHost = new TypeScriptServiceClientHost(this.descriptions)
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
        this.ensureConfiguration() // tslint:disable-line
        if (!started) {
          started = true
          resolve()
        }
      })
    })
  }

  private async ensureConfiguration(): Promise<void> {
    if (!this.clientHost) return
    let document = await workspace.document
    await wait(100)

    let uri = URI.parse(document.uri)
    let language = this.clientHost.findLanguage(uri)
    if (!language) return
    await language.fileConfigurationManager.ensureConfigurationForDocument(document.textDocument)
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
