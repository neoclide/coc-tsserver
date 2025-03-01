/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken, CancellationTokenSource, Document, Emitter, ExtensionContext, Memento, ServiceStat, Uri, window, workspace } from 'coc.nvim'
import path from 'path'
import * as fileSchemes from '../utils/fileSchemes'
import { PluginManager } from '../utils/plugins'
import BufferSyncSupport from './features/bufferSyncSupport'
import { DiagnosticKind, DiagnosticsManager } from './features/diagnostics'
import * as Proto from './protocol'
import { EventName } from './protocol.const'
import { OngoingRequestCancellerFactory } from './tsServer/cancellation'
import { ILogDirectoryProvider } from './tsServer/logDirectoryProvider'
import { ITypeScriptServer, TsServerProcessFactory, TypeScriptServerExitEvent } from './tsServer/server'
import { TypeScriptServerError } from './tsServer/serverError'
import { TypeScriptServerSpawner } from './tsServer/spawner'
import { TypeScriptVersionManager } from './tsServer/versionManager'
import { TypeScriptVersionProvider } from './tsServer/versionProvider'
import { ClientCapabilities, ClientCapability, ExecConfig, ITypeScriptServiceClient, ServerResponse, TypeScriptRequests } from './typescriptService'
import API from './utils/api'
import { areServiceConfigurationsEqual, ServiceConfigurationProvider, SyntaxServerConfiguration, TsServerLogLevel, TypeScriptServiceConfiguration } from './utils/configuration'
import { Disposable } from './utils/dispose'
import Logger from './utils/logger'
import { TypeScriptPluginPathsProvider } from './utils/pluginPathsProvider'
import Tracer from './utils/tracer'
import { inferredProjectCompilerOptions, ProjectType } from './utils/tsconfig'
import { VersionStatus } from './utils/versionStatus'

export interface IClientServices {
  logDirectoryProvider: ILogDirectoryProvider
  pluginManager: PluginManager
  processFactory: TsServerProcessFactory
  cancellerFactory: OngoingRequestCancellerFactory
}

interface ToCancelOnResourceChanged {
  readonly resource: string
  cancel(): void
}

export interface TsDiagnostics {
  readonly kind: DiagnosticKind
  readonly resource: string
  readonly diagnostics: Proto.Diagnostic[]
}

namespace ServerState {
  export const enum Type {
    None,
    Running,
    Errored
  }

  export const None = { type: Type.None } as const

  export class Running {
    readonly type = Type.Running;

    constructor(
      public readonly server: ITypeScriptServer,

      /**
       * API version obtained from the version picker after checking the corresponding path exists.
       */
      public readonly apiVersion: API,

      /**
       * Version reported by currently-running tsserver.
       */
      public tsserverVersion: string | undefined,
      public languageServiceEnabled: boolean,
    ) {}

    public readonly toCancelOnResourceChange = new Set<ToCancelOnResourceChanged>();

    updateTsserverVersion(tsserverVersion: string) {
      this.tsserverVersion = tsserverVersion
    }

    updateLanguageServiceEnabled(enabled: boolean) {
      this.languageServiceEnabled = enabled
    }
  }

  export class Errored {
    readonly type = Type.Errored;
    constructor(
      public readonly error: Error,
      public readonly tsServerLogFile: string | undefined,
    ) {}
  }

  export type State = typeof None | Running | Errored
}

export default class TypeScriptServiceClient extends Disposable implements ITypeScriptServiceClient {
  private token: number = 0
  public state = ServiceStat.Initial
  public readonly logger: Logger = new Logger()
  public readonly bufferSyncSupport: BufferSyncSupport
  public readonly diagnosticsManager: DiagnosticsManager
  // private readonly loadingIndicator = new ServerInitializingIndicator()
  private hasServerFatallyCrashedTooManyTimes = false
  private readonly globalState: Memento

  private readonly _onTsServerStarted = this._register(new Emitter<API>())
  public readonly onTsServerStarted = this._onTsServerStarted.event
  private readonly _onDiagnosticsReceived = this._register(new Emitter<TsDiagnostics>())
  public readonly onDiagnosticsReceived = this._onDiagnosticsReceived.event
  private readonly _onConfigDiagnosticsReceived = this._register(new Emitter<Proto.ConfigFileDiagnosticEvent>())
  public readonly onConfigDiagnosticsReceived = this._onConfigDiagnosticsReceived.event
  private readonly _onResendModelsRequested = this._register(new Emitter<void>())
  public readonly onResendModelsRequested = this._onResendModelsRequested.event
  private readonly _onProjectLanguageServiceStateChanged = this._register(new Emitter<Proto.ProjectLanguageServiceStateEventBody>())
  public readonly onProjectLanguageServiceStateChanged = this._onProjectLanguageServiceStateChanged.event
  private readonly _onDidBeginInstallTypings = this._register(new Emitter<Proto.BeginInstallTypesEventBody>());
  public readonly onDidBeginInstallTypings = this._onDidBeginInstallTypings.event;
  private readonly _onDidEndInstallTypings = this._register(new Emitter<Proto.EndInstallTypesEventBody>());
  public readonly onDidEndInstallTypings = this._onDidEndInstallTypings.event;
  private readonly _onTypesInstallerInitializationFailed = this._register(new Emitter<Proto.TypesInstallerInitializationFailedEventBody>())
  public readonly onTypesInstallerInitializationFailed = this._onTypesInstallerInitializationFailed.event
  private readonly _onDidChangeCapabilities = this._register(new Emitter<void>())
  public readonly onDidChangeCapabilities = this._onDidChangeCapabilities.event

  public readonly versionProvider: TypeScriptVersionProvider
  private pathSeparator: string
  private tracer: Tracer
  private _configuration: TypeScriptServiceConfiguration
  private versionStatus: VersionStatus
  private lastStart: number
  private numberRestarts: number
  private _onReady?: { promise: Promise<void>; resolve: () => void; reject: () => void }

  private readonly cancellerFactory: OngoingRequestCancellerFactory
  public readonly versionManager: TypeScriptVersionManager
  private readonly typescriptServerSpawner: TypeScriptServerSpawner
  private readonly pluginPathsProvider: TypeScriptPluginPathsProvider
  private readonly logDirectoryProvider: ILogDirectoryProvider
  private serviceConfigurationProvider: ServiceConfigurationProvider
  private _apiVersion: API
  private _tscPath: string
  private serverState: ServerState.State = ServerState.None
  private isRestarting = false
  public readonly pluginManager: PluginManager
  private readonly processFactory: TsServerProcessFactory

  constructor(
    public readonly context: ExtensionContext,
    public readonly modeIds: string[],
    services: IClientServices,
    tscPathVim: string | undefined
  ) {
    super()
    this.globalState = context.globalState
    this.pluginManager = services.pluginManager
    this.logDirectoryProvider = services.logDirectoryProvider
    this.processFactory = services.processFactory
    this.cancellerFactory = services.cancellerFactory
    this.pathSeparator = path.sep
    this.lastStart = Date.now()
    this.numberRestarts = 0
    let resolve: () => void
    let reject: () => void
    const p = new Promise<void>((res, rej) => {
      resolve = res
      reject = rej
    })
    this._onReady = { promise: p, resolve: resolve!, reject: reject! }
    this.serviceConfigurationProvider = new ServiceConfigurationProvider()
    this._configuration = this.serviceConfigurationProvider.loadFromWorkspace()
    this.versionProvider = new TypeScriptVersionProvider(this._configuration)
    this._apiVersion = API.defaultVersion
    this.tracer = new Tracer(this.logger)
    this.versionStatus = new VersionStatus()
    this.pluginPathsProvider = new TypeScriptPluginPathsProvider(this._configuration)
    this.versionManager = new TypeScriptVersionManager(this._configuration, this.versionProvider, tscPathVim)

    this.bufferSyncSupport = new BufferSyncSupport(this, modeIds)
    this.onReady(() => {
      this.bufferSyncSupport.listen()
    })

    this.diagnosticsManager = new DiagnosticsManager()
    this.bufferSyncSupport.onDelete(resource => {
      this.cancelInflightRequestsForResource(resource)
      this.diagnosticsManager.delete(resource)
    }, null, this._disposables)
    this.bufferSyncSupport.onWillChange(resource => {
      this.cancelInflightRequestsForResource(resource)
    })

    workspace.onDidChangeConfiguration(() => {
      const oldConfiguration = this._configuration
      this._configuration = this.serviceConfigurationProvider.loadFromWorkspace()
      this.versionProvider.updateConfiguration(this._configuration)
      this.versionManager.updateConfiguration(this._configuration)
      this.pluginPathsProvider.updateConfiguration(this._configuration)
      this.tracer.updateConfiguration()

      if (this.serverState.type === ServerState.Type.Running) {
        if (!this._configuration.implicitProjectConfiguration.isEqualTo(oldConfiguration.implicitProjectConfiguration)) {
          this.setCompilerOptionsForInferredProjects(this._configuration)
        }

        if (!areServiceConfigurationsEqual(this._configuration, oldConfiguration)) {
          this.restartTsServer()
        }
      }
    }, this, this._disposables)

    this.typescriptServerSpawner = new TypeScriptServerSpawner(this.versionProvider, this.logDirectoryProvider, this.pluginPathsProvider, this.logger, this.tracer, this.processFactory)

    this._register(this.pluginManager.onDidUpdateConfig(update => {
      this.configurePlugin(update.pluginId, update.config)
    }))

    this._register(this.pluginManager.onDidChangePlugins(() => {
      this.restartTsServer()
    }))
  }

  public get configuration(): TypeScriptServiceConfiguration {
    return this._configuration
  }

  public onReady(f: () => void): Promise<void> {
    return this._onReady!.promise.then(f)
  }

  public override dispose(): void {
    super.dispose()
    this.versionStatus.dispose()
    this.bufferSyncSupport.dispose()
    this.diagnosticsManager.dispose()

    if (this.serverState.type === ServerState.Type.Running) {
      this.serverState.server.kill()
    }
  }

  private info(message: string, data?: any): void {
    this.logger.info(message, data)
  }

  private error(message: string, data?: any): void {
    this.logger.error(message, data)
  }

  public restartTsServer(fromUserAction = false): void {
    if (!this._configuration.enable) return
    if (this.serverState.type === ServerState.Type.Running) {
      this.info('Killing TS Server')
      this.isRestarting = true
      this.state = ServiceStat.Stopping
      this.serverState.server.kill()
    }

    if (fromUserAction) {
      // Reset crash trackers
      this.hasServerFatallyCrashedTooManyTimes = false
      this.numberRestarts = 0
      this.lastStart = Date.now()
    }
    this.serverState = this.startService(true)
  }

  public stop(): void {
    if (this.serverState.type === ServerState.Type.Running) {
      this.info('Killing TS Server')
      this.state = ServiceStat.Stopping
      this.isRestarting = true
      this.serverState.server.kill()
    }
  }

  public async updateGlobalState(key: string, value: any): Promise<void> {
    await this.globalState.update(key, value)
  }

  public getGlobalState<T>(key: string): T | undefined {
    return this.globalState.get(key)
  }


  public get apiVersion(): API {
    if (this.serverState.type === ServerState.Type.Running) {
      return this.serverState.apiVersion
    }
    return API.defaultVersion
  }

  public get tscPath(): string {
    return this._tscPath
  }

  public ensureServiceStarted(): void {
    if (this.serverState.type !== ServerState.Type.Running) {
      this.startService()
    }
  }

  private startService(resendModels: boolean = false): ServerState.State {
    this.info(`Starting TS Server`)

    if (this.isDisposed) {
      this.info(`Not starting server: disposed`)
      return ServerState.None
    }

    if (this.hasServerFatallyCrashedTooManyTimes) {
      this.info(`Not starting server: too many crashes`)
      return ServerState.None
    }

    let version = this.versionManager.currentVersion
    if (!version.isValid) {
      void window.showWarningMessage(`The path ${version.path} doesn\'t point to a valid tsserver install. Falling back to bundled TypeScript version.`)
      this.versionManager.reset()
      version = this.versionManager.currentVersion
    }

    this.info(`Using tsserver from: ${version.path}`)

    const apiVersion = version.version || API.defaultVersion
    const mytoken = ++this.token
    const handle = this.typescriptServerSpawner.spawn(version, this.capabilities, this.configuration, this.pluginManager, this.cancellerFactory, {
      onFatalError: (command, err) => this.fatalError(command, err),
    })
    this.state = ServiceStat.Starting
    this.serverState = new ServerState.Running(handle, apiVersion, undefined, true)
    this.lastStart = Date.now()

    /* __GDPR__
      "tsserver.spawned" : {
        "owner": "mjbvz",
        "${include}": [
          "${TypeScriptCommonProperties}"
        ],
        "localTypeScriptVersion": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
        "typeScriptVersionSource": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
      }
    */

    handle.onError((err: Error) => {
      if (this.token !== mytoken) {
        // this is coming from an old process
        return
      }

      if (err) {
        this.state = ServiceStat.StartFailed
        window.showErrorMessage(`TypeScript language server exited with error. Error message is: ${err.message || err.name}`)
      }

      this.serverState = new ServerState.Errored(err, handle.tsServerLogFile)
      this.error('TSServer errored with error.', err)
      if (handle.tsServerLogFile) {
        this.error(`TSServer log file: ${handle.tsServerLogFile}`)
      }

      /* __GDPR__
        "tsserver.error" : {
          "owner": "mjbvz",
          "${include}": [
            "${TypeScriptCommonProperties}"
          ]
        }
      */
      this.serviceExited(false)
    })

    handle.onExit((data: TypeScriptServerExitEvent) => {
      const { code, signal } = data
      this.error(`TSServer exited. Code: ${code}. Signal: ${signal}`)

      // In practice, the exit code is an integer with no ties to any identity,
      // so it can be classified as SystemMetaData, rather than CallstackOrException.
      /* __GDPR__
        "tsserver.exitWithCode" : {
          "owner": "mjbvz",
          "code" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
          "signal" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
          "${include}": [
            "${TypeScriptCommonProperties}"
          ]
        }
      */
      if (this.token !== mytoken) {
        // this is coming from an old process
        return
      }
      this.state = ServiceStat.Stopped

      if (handle.tsServerLogFile) {
        this.info(`TSServer log file: ${handle.tsServerLogFile}`)
      }
      this.serviceExited(!this.isRestarting)
      this.isRestarting = false
    })

    handle.onEvent(event => this.dispatchEvent(event))

    if (apiVersion.gte(API.v300) && this.capabilities.has(ClientCapability.Semantic)) {
      // this.loadingIndicator.startedLoadingProject(undefined /* projectName */)
      this.versionStatus.loading = true
    }
    workspace.nvim.setVar('Coc_tsserver_path', version.tscPath, true)
    this.serviceStarted(resendModels)
    this._onReady!.resolve()
    this._onTsServerStarted.fire(version.version)
    this.versionStatus.onDidChangeTypeScriptVersion(version)
    this.state = ServiceStat.Running
    this._onDidChangeCapabilities.fire()
    return this.serverState
  }

  public async openTsServerLogFile(): Promise<boolean> {
    const isRoot = process.getuid && process.getuid() == 0
    let showWarning = (msg: string) => {
      window.showWarningMessage(msg)
    }
    if (isRoot) {
      showWarning('Log disabled for root user.')
      return false
    }
    if (!this.apiVersion.gte(API.v222)) {
      showWarning('TS Server logging requires TS 2.2.2+')
      return false
    }
    if (this._configuration.tsServerLogLevel === TsServerLogLevel.Off) {
      showWarning(`TS Server logging is off. Change 'tsserver.log' in 'coc-settings.json' to enable`)
      return false
    }
    if (this.serverState.type !== ServerState.Type.Running || !this.serverState.server.tsServerLogFile) {
      showWarning('TS Server has not started logging.')
      return false
    }

    let tsServerLogFile = this.serverState.server.tsServerLogFile
    try {
      let uri = Uri.file(tsServerLogFile)
      await workspace.jumpTo(uri.toString(), undefined, 'tabe')
      return true
    } catch {
      showWarning('Could not open TS Server log file')
      return false
    }
  }

  private serviceStarted(resendModels: boolean): void {
    this.bufferSyncSupport.reset()
    const watchOptions = this.apiVersion.gte(API.v380)
      ? this.configuration.watchOptions
      : undefined
    const configureOptions: Proto.ConfigureRequestArguments = {
      hostInfo: 'coc-nvim',
      preferences: {
        providePrefixAndSuffixTextForRename: true,
        allowRenameOfImportPath: true,
        includePackageJsonAutoImports: this._configuration.includePackageJsonAutoImports
      },
      watchOptions
    }
    this.executeWithoutWaitingForResponse('configure', configureOptions)
    this.setCompilerOptionsForInferredProjects(this._configuration)
    if (resendModels) {
      this._onResendModelsRequested.fire()
      this.bufferSyncSupport.reinitialize()
      this.bufferSyncSupport.requestAllDiagnostics()
    }

    // Reconfigure any plugins
    for (const [pluginName, config] of this.pluginManager.configurations()) {
      this.configurePlugin(pluginName, config)
    }
  }

  private setCompilerOptionsForInferredProjects(
    configuration: TypeScriptServiceConfiguration
  ): void {
    const args: Proto.SetCompilerOptionsForInferredProjectsArgs = {
      options: this.getCompilerOptionsForInferredProjects(configuration)
    }
    this.executeWithoutWaitingForResponse('compilerOptionsForInferredProjects', args)
  }

  private getCompilerOptionsForInferredProjects(
    configuration: TypeScriptServiceConfiguration
  ): Proto.ExternalProjectCompilerOptions {
    return {
      ...inferredProjectCompilerOptions(ProjectType.TypeScript, configuration),
      allowJs: true,
      allowSyntheticDefaultImports: true,
      allowNonTsExtensions: true
    }
  }

  private serviceExited(restart: boolean): void {
    this.versionStatus.loading = false
    // this.loadingIndicator.reset()
    this.serverState = ServerState.None

    if (restart) {
      const diff = Date.now() - this.lastStart
      this.numberRestarts++
      let startService = true

      const pluginExtensionList = this.pluginManager.plugins.map(plugin => plugin.name).join(', ')

      if (this.numberRestarts > 5) {
        this.numberRestarts = 0
        if (diff < 10 * 1000 /* 10 seconds */) {
          this.lastStart = Date.now()
          startService = false
          this.hasServerFatallyCrashedTooManyTimes = true
          window.showErrorMessage(
            this.pluginManager.plugins.length
              ? `The JS/TS language service immediately crashed 5 times. The service will not be restarted.\nThis may be caused by a plugin contributed by one of these extensions: ${pluginExtensionList}`
              : "The JS/TS language service immediately crashed 5 times. The service will not be restarted.",
          )
        } else if (diff < 60 * 1000 * 5 /* 5 Minutes */) {
          this.lastStart = Date.now()
          window.showWarningMessage(
            this.pluginManager.plugins.length
              ? `The JS/TS language service crashed 5 times in the last 5 Minutes.\nThis may be caused by a plugin contributed by one of these extensions: ${pluginExtensionList}`
              : "The JS/TS language service crashed 5 times in the last 5 Minutes.",
          )
        }
      }

      if (startService) {
        this.startService(true)
      }
    }
  }

  public toPath(uri: string): string {
    return this.normalizedPath(Uri.parse(uri))
  }

  public toOpenedFilePath(uri: string, options: { suppressAlertOnFailure?: boolean } = {}): string | undefined {
    if (!this.bufferSyncSupport.ensureHasBuffer(uri)) {
      if (!options.suppressAlertOnFailure) {
        this.error(`Unexpected resource ${uri}`)
      }
      return undefined
    }
    return this.toPath(uri)
  }

  public toResource(filepath: string): string {
    if (filepath.includes('zipfile:')) {
      return filepath.replace(/.*zipfile:/, 'zipfile://')
    }
    if (this._apiVersion.gte(API.v213)) {
      if (filepath.startsWith(this.inMemoryResourcePrefix + 'untitled:')) {
        let resource = Uri.parse(filepath)
        if (this.inMemoryResourcePrefix) {
          const dirName = path.dirname(resource.path)
          const fileName = path.basename(resource.path)
          if (fileName.startsWith(this.inMemoryResourcePrefix)) {
            resource = resource.with({ path: path.posix.join(dirName, fileName.slice(this.inMemoryResourcePrefix.length)) })
          }
        }
        return resource.toString()
      }
    }
    return Uri.file(filepath).toString()
  }

  public normalizedPath(resource: Uri): string | undefined {
    if (fileSchemes.disabledSchemes.has(resource.scheme)) {
      return undefined
    }
    switch (resource.scheme) {
      case fileSchemes.file: {
        let result = resource.fsPath
        if (!result) return undefined
        result = path.normalize(result)
        // Both \ and / must be escaped in regular expressions
        return result.replace(new RegExp('\\' + this.pathSeparator, 'g'), '/')
      }
      default: {
        return this.inMemoryResourcePrefix + resource.toString(true)
      }
    }
  }

  public getDocument(resource: string): Document | undefined {
    if (resource.startsWith('untitled:')) {
      let bufnr = parseInt(resource.split(':', 2)[1], 10)
      return workspace.getDocument(bufnr)
    }
    return workspace.getDocument(resource)
  }

  private get inMemoryResourcePrefix(): string {
    return this._apiVersion.gte(API.v270) ? '^' : ''
  }

  public asUrl(filepath: string): Uri {
    if (this._apiVersion.gte(API.v213)) {
      if (filepath.startsWith(this.inMemoryResourcePrefix + 'untitled:')) {
        let resource = Uri.parse(filepath.slice(this.inMemoryResourcePrefix.length))
        if (this.inMemoryResourcePrefix) {
          const dirName = path.dirname(resource.path)
          const fileName = path.basename(resource.path)
          if (fileName.startsWith(this.inMemoryResourcePrefix)) {
            resource = resource.with({
              path: path.posix.join(
                dirName,
                fileName.slice(this.inMemoryResourcePrefix.length)
              )
            })
          }
        }
        return resource
      }
    }
    return Uri.file(filepath)
  }

  public execute(command: keyof TypeScriptRequests, args: any, token: CancellationToken, config?: ExecConfig): Promise<ServerResponse.Response<Proto.Response>> {
    let executions: Array<Promise<ServerResponse.Response<Proto.Response>> | undefined> | undefined

    if (config?.cancelOnResourceChange) {
      const runningServerState = this.serverState
      if (runningServerState.type === ServerState.Type.Running) {
        const source = new CancellationTokenSource()
        token.onCancellationRequested(() => source.cancel())

        const inFlight: ToCancelOnResourceChanged = {
          resource: config.cancelOnResourceChange,
          cancel: () => source.cancel(),
        }
        runningServerState.toCancelOnResourceChange.add(inFlight)

        executions = this.executeImpl(command, args, {
          isAsync: false,
          token: source.token,
          expectsResult: true,
          ...config,
        })
        executions[0]!.finally(() => {
          runningServerState.toCancelOnResourceChange.delete(inFlight)
          source.dispose()
        })
      }
    }

    if (!executions) {
      executions = this.executeImpl(command, args, {
        isAsync: false,
        token,
        expectsResult: true,
        ...config,
      })
    }

    if (config?.nonRecoverable) {
      executions[0]!.catch(err => this.fatalError(command, err))
    }

    if (command === 'updateOpen') {
      // If update open has completed, consider that the project has loaded
      Promise.all(executions).then(() => {
        this.versionStatus.loading = false
        // this.loadingIndicator.reset()
      })
    }

    return executions[0]!
  }

  private fatalError(command: string, error: any): void {
    let msg = `A non-recoverable error occurred while executing tsserver command: ${command}`
    this.error(msg)
    window.showErrorMessage(msg)
    if (error instanceof TypeScriptServerError && error.serverErrorText) {
      this.error(error.serverErrorText)
    }
    if (this.serverState.type === ServerState.Type.Running) {
      this.info('Killing TS Server')
      this.state = ServiceStat.Stopping
      const logfile = this.serverState.server.tsServerLogFile
      this.serverState.server.kill()
      if (error instanceof TypeScriptServerError) {
        this.serverState = new ServerState.Errored(error, logfile)
      }
    }
  }

  public executeAsync(command: keyof TypeScriptRequests, args: Proto.GeterrRequestArgs, token: CancellationToken): Promise<ServerResponse.Response<Proto.Response>> {
    return this.executeImpl(command, args, {
      isAsync: true,
      token,
      expectsResult: true
    })[0]!
  }

  public executeWithoutWaitingForResponse(command: keyof TypeScriptRequests, args: any): void {
    this.executeImpl(command, args, {
      isAsync: false,
      token: undefined,
      expectsResult: false
    })
  }

  private executeImpl(command: keyof TypeScriptRequests, args: any, executeInfo: { isAsync: boolean; token?: CancellationToken; expectsResult: boolean; lowPriority?: boolean; requireSemantic?: boolean }): Array<Promise<ServerResponse.Response<Proto.Response>> | undefined> {
    const serverState = this.serverState
    if (serverState.type === ServerState.Type.Running) {
      this.bufferSyncSupport.beforeCommand(command)
      return serverState.server.executeImpl(command, args, executeInfo)
    } else {
      return [Promise.resolve(ServerResponse.NoServer)]
    }
  }

  private dispatchEvent(event: Proto.Event): void {
    switch (event.event) {
      case EventName.syntaxDiag:
      case EventName.semanticDiag:
      case EventName.suggestionDiag: {
        // This event also roughly signals that projects have been loaded successfully (since the TS server is synchronous)
        this.versionStatus.loading = false

        const diagnosticEvent = event as Proto.DiagnosticEvent
        if (diagnosticEvent.body?.diagnostics) {
          this._onDiagnosticsReceived.fire({
            kind: getDiagnosticsKind(event),
            resource: this.toResource(diagnosticEvent.body.file),
            diagnostics: diagnosticEvent.body.diagnostics
          })
        }
        break
      }
      case EventName.configFileDiag:
        this._onConfigDiagnosticsReceived.fire(event as Proto.ConfigFileDiagnosticEvent)
        break

      case EventName.telemetry: {
        const body = (event as Proto.TelemetryEvent).body
        // ignored
        // this.dispatchTelemetryEvent(body)
        break
      }
      case EventName.projectLanguageServiceState: {
        const body = (event as Proto.ProjectLanguageServiceStateEvent).body!
        if (this.serverState.type === ServerState.Type.Running) {
          this.serverState.updateLanguageServiceEnabled(body.languageServiceEnabled)
        }
        this._onProjectLanguageServiceStateChanged.fire(body)
        break
      }
      case EventName.projectsUpdatedInBackground: {
        this.versionStatus.loading = false
        // this.loadingIndicator.reset()

        const body = (event as Proto.ProjectsUpdatedInBackgroundEvent).body
        const resources = body.openFiles.map(file => Uri.parse(this.toResource(file)))
        this.bufferSyncSupport.getErr(resources)
        break
      }
      case EventName.beginInstallTypes:
        this._onDidBeginInstallTypings.fire((event as Proto.BeginInstallTypesEvent).body)
        break

      case EventName.endInstallTypes:
        this._onDidEndInstallTypings.fire((event as Proto.EndInstallTypesEvent).body)
        break

      case EventName.typesInstallerInitializationFailed:
        this._onTypesInstallerInitializationFailed.fire((event as Proto.TypesInstallerInitializationFailedEvent).body)
        break

      case EventName.surveyReady:
        // ignored
        break

      case EventName.projectLoadingStart:
        // this.loadingIndicator.startedLoadingProject((event as Proto.ProjectLoadingStartEvent).body.projectName)
        this.versionStatus.loading = true
        break

      case EventName.projectLoadingFinish:
        // this.loadingIndicator.finishedLoadingProject((event as Proto.ProjectLoadingFinishEvent).body.projectName)
        this.versionStatus.loading = false
        break
    }
  }

  public interruptGetErr<R>(f: () => R): R {
    return this.bufferSyncSupport.interruptGetErr(f)
  }

  private cancelInflightRequestsForResource(resource: string): void {
    if (this.serverState.type !== ServerState.Type.Running) {
      return
    }

    for (const request of this.serverState.toCancelOnResourceChange) {
      if (request.resource.toString() === resource.toString()) {
        request.cancel()
      }
    }
  }

  public get capabilities() {
    if (this._configuration.useSyntaxServer === SyntaxServerConfiguration.Always) {
      return new ClientCapabilities(
        ClientCapability.Syntax,
        ClientCapability.EnhancedSyntax)
    }

    if (this.apiVersion.gte(API.v400)) {
      return new ClientCapabilities(
        ClientCapability.Syntax,
        ClientCapability.EnhancedSyntax,
        ClientCapability.Semantic)
    }

    return new ClientCapabilities(
      ClientCapability.Syntax,
      ClientCapability.Semantic)
  }

  public hasCapabilityForResource(resource: Uri, capability: ClientCapability): boolean {
    if (!this.capabilities.has(capability)) {
      return false
    }

    switch (capability) {
      case ClientCapability.Semantic:
        {
          return fileSchemes.semanticSupportedSchemes.includes(resource.scheme)
        }
      case ClientCapability.Syntax:
      case ClientCapability.EnhancedSyntax:
        {
          return true
        }
    }
  }

  public getWorkspaceRootForResource(resource: Uri): string | undefined {
    const roots = workspace.workspaceFolders ? Array.from(workspace.workspaceFolders) : undefined
    if (!roots?.length) return undefined
    const uris: Uri[] = roots.map(f => Uri.parse(f.uri))

    switch (resource.scheme) {
      case fileSchemes.file:
      case fileSchemes.untitled:
      case fileSchemes.vscodeNotebookCell:
      case fileSchemes.memFs:
        // case fileSchemes.vscodeVfs:
        // case fileSchemes.officeScript:
        for (const uri of uris.sort((a, b) => a.fsPath.length - b.fsPath.length)) {
          if (resource.fsPath.startsWith(uri.fsPath + path.sep)) {
            return uri.fsPath
          }
        }
        return uris[0].fsPath

      default:
        return undefined
    }
  }

  private configurePlugin(pluginName: string, configuration: {}): any {
    if (this.apiVersion.gte(API.v314)) {
      this.executeWithoutWaitingForResponse('configurePlugin', { pluginName, configuration })
    }
  }
}

function getDiagnosticsKind(event: Proto.Event): DiagnosticKind {
  switch (event.event) {
    case 'syntaxDiag':
      return DiagnosticKind.Syntax
    case 'semanticDiag':
      return DiagnosticKind.Semantic
    case 'suggestionDiag':
      return DiagnosticKind.Suggestion
  }
  throw new Error('Unknown diagnostics kind')
}
