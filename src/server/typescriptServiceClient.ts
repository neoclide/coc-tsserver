/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Document, ServiceStat, Uri, window, workspace } from 'coc.nvim'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { CancellationToken, CancellationTokenSource, Disposable, Emitter, Event } from 'vscode-languageserver-protocol'
import * as fileSchemes from '../utils/fileSchemes'
import { PluginManager } from '../utils/plugins'
import { CallbackMap } from './callbackMap'
import BufferSyncSupport from './features/bufferSyncSupport'
import { DiagnosticKind, DiagnosticsManager } from './features/diagnostics'
import FileConfigurationManager from './features/fileConfigurationManager'
import * as Proto from './protocol'
import { RequestItem, RequestQueue, RequestQueueingType } from './requestQueue'
import { ExecConfig, ITypeScriptServiceClient, ServerResponse } from './typescriptService'
import API from './utils/api'
import { TsServerLogLevel, TypeScriptServiceConfiguration } from './utils/configuration'
import Logger from './utils/logger'
import { fork, getTempDirectory, createTempDirectory, getTempFile, IForkOptions, makeRandomHexString } from './utils/process'
import Tracer from './utils/tracer'
import { inferredProjectConfig } from './utils/tsconfig'
import { TypeScriptVersion, TypeScriptVersionProvider } from './utils/versionProvider'
import VersionStatus from './utils/versionStatus'
import ForkedTsServerProcess, { ToCancelOnResourceChanged } from './tsServerProcess'

export interface TsDiagnostics {
  readonly kind: DiagnosticKind
  readonly resource: Uri
  readonly diagnostics: Proto.Diagnostic[]
}

export default class TypeScriptServiceClient implements ITypeScriptServiceClient {
  private token: number = 0
  private noRestart = false
  public state = ServiceStat.Initial
  public readonly logger: Logger = new Logger()
  public readonly bufferSyncSupport: BufferSyncSupport
  public readonly diagnosticsManager: DiagnosticsManager

  private fileConfigurationManager: FileConfigurationManager
  private pathSeparator: string
  private tracer: Tracer
  private _configuration: TypeScriptServiceConfiguration
  private versionProvider: TypeScriptVersionProvider
  private tsServerLogFile: string | null = null
  private tsServerProcess: ForkedTsServerProcess | undefined
  private lastStart: number
  private numberRestarts: number
  private cancellationPipeName: string | null = null
  private _callbacks = new CallbackMap<Proto.Response>()
  private _requestQueue = new RequestQueue()
  private _pendingResponses = new Set<number>()
  private _onReady?: { promise: Promise<void>; resolve: () => void; reject: () => void }

  private versionStatus: VersionStatus
  private readonly _onTsServerStarted = new Emitter<API>()
  private readonly _onProjectLanguageServiceStateChanged = new Emitter<Proto.ProjectLanguageServiceStateEventBody>()
  private readonly _onDidBeginInstallTypings = new Emitter<Proto.BeginInstallTypesEventBody>()
  private readonly _onDidEndInstallTypings = new Emitter<Proto.EndInstallTypesEventBody>()
  private readonly _onTypesInstallerInitializationFailed = new Emitter<
    Proto.TypesInstallerInitializationFailedEventBody
  >()
  private _apiVersion: API
  private _tscPath: string
  private readonly disposables: Disposable[] = []
  private isRestarting = false

  constructor(
    public readonly pluginManager: PluginManager,
    public readonly modeIds: string[],
    private readonly tscPathVim: string | undefined
  ) {
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

    this.fileConfigurationManager = new FileConfigurationManager(this)
    this._configuration = TypeScriptServiceConfiguration.loadFromWorkspace()
    this.versionProvider = new TypeScriptVersionProvider(this._configuration)
    this._apiVersion = API.defaultVersion
    this.tracer = new Tracer(this.logger)
    this.versionStatus = new VersionStatus(this.normalizePath.bind(this), this.fileConfigurationManager.enableJavascript())
    pluginManager.onDidUpdateConfig(update => {
      this.configurePlugin(update.pluginId, update.config)
    }, null, this.disposables)

    pluginManager.onDidChangePlugins(() => {
      this.restartTsServer()
    }, null, this.disposables)

    this.bufferSyncSupport = new BufferSyncSupport(this, modeIds)
    this.onReady(() => {
      this.bufferSyncSupport.listen()
    })

    this.diagnosticsManager = new DiagnosticsManager()
    this.bufferSyncSupport.onDelete(resource => {
      this.cancelInflightRequestsForResource(resource)
      this.diagnosticsManager.delete(resource)
    }, null, this.disposables)
    this.bufferSyncSupport.onWillChange(resource => {
      this.cancelInflightRequestsForResource(resource)
    })
  }

  private _onDiagnosticsReceived = new Emitter<TsDiagnostics>()
  public get onDiagnosticsReceived(): Event<TsDiagnostics> {
    return this._onDiagnosticsReceived.event
  }

  private _onConfigDiagnosticsReceived = new Emitter<Proto.ConfigFileDiagnosticEvent>()
  public get onConfigDiagnosticsReceived(): Event<Proto.ConfigFileDiagnosticEvent> {
    return this._onConfigDiagnosticsReceived.event
  }

  private _onResendModelsRequested = new Emitter<void>()
  public get onResendModelsRequested(): Event<void> {
    return this._onResendModelsRequested.event
  }

  public get configuration(): TypeScriptServiceConfiguration {
    return this._configuration
  }

  public onReady(f: () => void): Promise<void> {
    return this._onReady!.promise.then(f)
  }

  public dispose(): void {
    this.tsServerProcess.kill()
    this.diagnosticsManager.dispose()
    this.bufferSyncSupport.dispose()
    this.logger.dispose()
    this._onTsServerStarted.dispose()
    this._onProjectLanguageServiceStateChanged.dispose()
    this._onDidBeginInstallTypings.dispose()
    this._onDidEndInstallTypings.dispose()
    this._onTypesInstallerInitializationFailed.dispose()
    this._onResendModelsRequested.dispose()
    this.versionStatus.dispose()
  }

  private info(message: string, data?: any): void {
    this.logger.info(message, data)
  }

  private error(message: string, data?: any): void {
    this.logger.error(message, data)
  }

  public restartTsServer(): void {
    if (this.tsServerProcess) {
      this.state = ServiceStat.Stopping
      this.info('Killing TS Server')
      this.isRestarting = true
      this.tsServerProcess.kill()
    }
    this.startService(true)
  }

  public stop(): Promise<void> {
    return new Promise(resolve => {
      let { tsServerProcess } = this
      if (tsServerProcess && this.state == ServiceStat.Running) {
        this.info('Killing TS Server')
        tsServerProcess.onExit(() => {
          resolve()
        })
        this.noRestart = true
        tsServerProcess.kill()
      } else {
        resolve()
      }
    })
  }

  public get onTsServerStarted(): Event<API> {
    return this._onTsServerStarted.event
  }

  public get onProjectLanguageServiceStateChanged(): Event<
    Proto.ProjectLanguageServiceStateEventBody
  > {
    return this._onProjectLanguageServiceStateChanged.event
  }

  public get onDidBeginInstallTypings(): Event<Proto.BeginInstallTypesEventBody> {
    return this._onDidBeginInstallTypings.event
  }

  public get onDidEndInstallTypings(): Event<Proto.EndInstallTypesEventBody> {
    return this._onDidEndInstallTypings.event
  }

  public get onTypesInstallerInitializationFailed(): Event<Proto.TypesInstallerInitializationFailedEventBody> {
    return this._onTypesInstallerInitializationFailed.event
  }

  public get apiVersion(): API {
    return this._apiVersion
  }

  public get tscPath(): string {
    return this._tscPath
  }

  public ensureServiceStarted(): void {
    if (!this.tsServerProcess) {
      this.startService()
    }
  }

  private startService(resendModels = false): ForkedTsServerProcess | undefined {
    const { ignoreLocalTsserver } = this.configuration
    let currentVersion: TypeScriptVersion
    if (this.tscPathVim) currentVersion = this.versionProvider.getVersionFromTscPath(this.tscPathVim)
    if (!currentVersion && !ignoreLocalTsserver) currentVersion = this.versionProvider.getLocalVersion()
    if (!currentVersion || !fs.existsSync(currentVersion.tsServerPath)) {
      this.info('Local tsserver not found, using bundled tsserver with coc-tsserver.')
      currentVersion = this.versionProvider.getDefaultVersion()
    }
    if (!currentVersion || !currentVersion.isValid) {
      if (this.configuration.globalTsdk) {
        window.showErrorMessage(`Can not find typescript module, in 'tsserver.tsdk': ${this.configuration.globalTsdk}`)
      } else {
        window.showErrorMessage(`Can not find typescript module, run ':CocInstall coc-tsserver' to fix it!`)
      }
      return
    }
    this._apiVersion = currentVersion.version
    this._tscPath = currentVersion.tscPath
    workspace.nvim.setVar('Tsserver_path', this._tscPath, true)
    this.versionStatus.onDidChangeTypeScriptVersion(currentVersion)
    const tsServerForkArgs = this.getTsServerArgs(currentVersion)
    const options = { execArgv: this.getExecArgv() }
    return this.startProcess(currentVersion, tsServerForkArgs, options, resendModels)
  }

  private getExecArgv(): string[] {
    const args: string[] = []
    const debugPort = getDebugPort()
    if (debugPort) {
      const isBreak = process.env[process.env.remoteName ? 'TSS_REMOTE_DEBUG_BRK' : 'TSS_DEBUG_BRK'] !== undefined
      const inspectFlag = isBreak ? '--inspect-brk' : '--inspect'
      args.push(`${inspectFlag}=${debugPort}`)
    }
    const maxTsServerMemory = this._configuration.maxTsServerMemory
    if (maxTsServerMemory) {
      args.push(`--max-old-space-size=${maxTsServerMemory}`)
    }
    return args
  }

  private startProcess(currentVersion: TypeScriptVersion, args: string[], options: IForkOptions, resendModels: boolean): ForkedTsServerProcess {
    const myToken = ++this.token
    this.state = ServiceStat.Starting
    try {
      let childProcess = fork(currentVersion.tsServerPath, args, options, this.logger)
      this.state = ServiceStat.Running
      this.info('Starting TSServer', JSON.stringify(currentVersion, null, 2))
      const handle = new ForkedTsServerProcess(childProcess)
      this.tsServerProcess = handle
      this.lastStart = Date.now()
      handle.onError((err: Error) => {
        if (this.token != myToken) return
        window.showErrorMessage(`TypeScript language server exited with error. Error message is: ${err.message}`)
        this.error('TSServer errored with error.', err)
        this.error(`TSServer log file: ${this.tsServerLogFile || ''}`)
        window.showMessage(`TSServer errored with error. ${err.message}`, 'error')
        this.serviceExited(false)
      })
      handle.onExit((code: any, signal: string) => {
        handle.dispose()
        if (this.token != myToken) return
        if (code == null) {
          this.info(`TSServer exited. Signal: ${signal}`)
        } else {
          this.error(`TSServer exited with code: ${code}. Signal: ${signal}`)
        }
        this.info(`TSServer log file: ${this.tsServerLogFile || ''}`)
        this.serviceExited(!this.isRestarting)
        this.isRestarting = false
      })
      handle.onData(msg => {
        this.dispatchMessage(msg)
      })
      this.serviceStarted(resendModels)
      this._onReady!.resolve()
      this._onTsServerStarted.fire(currentVersion.version)
      return handle
    } catch (err) {
      this.state = ServiceStat.StartFailed
      this.error('Starting TSServer failed with error.', err.stack)
      return undefined
    }
  }

  public async openTsServerLogFile(): Promise<boolean> {
    const isRoot = process.getuid && process.getuid() == 0
    let echoErr = (msg: string) => {
      window.showErrorMessage(msg)
    }
    if (isRoot) {
      echoErr('Log disabled for root user.')
      return false
    }
    if (!this.apiVersion.gte(API.v222)) {
      echoErr('TS Server logging requires TS 2.2.2+')
      return false
    }
    if (this._configuration.tsServerLogLevel === TsServerLogLevel.Off) {
      echoErr(`TS Server logging is off. Change 'tsserver.log' in 'coc-settings.json' to enable`)
      return false
    }
    if (!this.tsServerLogFile) {
      echoErr('TS Server has not started logging.')
      return false
    }
    try {
      await workspace.nvim.command(`edit ${this.tsServerLogFile}`)
      return true
    } catch {
      echoErr('Could not open TS Server log file')
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
    this.executeWithoutWaitingForResponse('configure', configureOptions) // tslint:disable-line
    this.setCompilerOptionsForInferredProjects(this._configuration)
    if (resendModels) {
      this._onResendModelsRequested.fire(void 0)
      this.fileConfigurationManager.reset()
      this.diagnosticsManager.reInitialize()
      this.bufferSyncSupport.reinitialize()
    }
    // Reconfigure any plugins
    for (const [config, pluginName] of this.pluginManager.configurations()) {
      this.configurePlugin(config, pluginName)
    }
  }

  private setCompilerOptionsForInferredProjects(
    configuration: TypeScriptServiceConfiguration
  ): void {
    if (!this.apiVersion.gte(API.v206)) return
    const args: Proto.SetCompilerOptionsForInferredProjectsArgs = {
      options: this.getCompilerOptionsForInferredProjects(configuration)
    }
    this.executeWithoutWaitingForResponse('compilerOptionsForInferredProjects', args) // tslint:disable-line
  }

  private getCompilerOptionsForInferredProjects(
    configuration: TypeScriptServiceConfiguration
  ): Proto.ExternalProjectCompilerOptions {
    return {
      ...inferredProjectConfig(configuration),
      allowJs: true,
      allowSyntheticDefaultImports: true,
      allowNonTsExtensions: true
    }
  }

  private serviceExited(restart: boolean): void {
    this.state = ServiceStat.Stopped
    this.tsServerLogFile = null
    this._callbacks.destroy('Service died.')
    this._callbacks = new CallbackMap<Proto.Response>()
    this._requestQueue = new RequestQueue()
    this._pendingResponses = new Set<number>()
    if (this.noRestart) {
      this.noRestart = false
      return
    }
    if (restart) {
      const diff = Date.now() - this.lastStart
      this.numberRestarts++
      let startService = true
      if (this.numberRestarts > 5) {
        this.numberRestarts = 0
        if (diff < 10 * 1000 /* 10 seconds */) {
          this.lastStart = Date.now()
          startService = false
          window.showMessage('The TypeScript language service died 5 times right after it got started.', 'error') // tslint:disable-line
        } else if (diff < 60 * 1000 /* 1 Minutes */) {
          this.lastStart = Date.now()
          window.showMessage('The TypeScript language service died unexpectedly 5 times in the last 5 Minutes.', 'error') // tslint:disable-line
        }
      }
      if (startService) {
        this.startService(true)
      }
    }
  }

  public toPath(uri: string): string {
    return this.normalizePath(Uri.parse(uri))
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
      return filepath.replace(/.*zipfile:/, 'zipfile://');
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

  public normalizePath(resource: Uri): string | undefined {
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

  public execute(
    command: string, args: any,
    token: CancellationToken,
    config?: ExecConfig
  ): Promise<ServerResponse.Response<Proto.Response>> {
    let execution: Promise<ServerResponse.Response<Proto.Response>>

    if (config?.cancelOnResourceChange) {
      const source = new CancellationTokenSource()
      token.onCancellationRequested(() => source.cancel())
      const inFlight: ToCancelOnResourceChanged = {
        resource: config.cancelOnResourceChange,
        cancel: () => source.cancel(),
      }
      this.tsServerProcess?.toCancelOnResourceChange.add(inFlight)

      execution = this.executeImpl(command, args, {
        isAsync: false,
        token: source.token,
        expectsResult: true,
        ...config,
      }).finally(() => {
        this.tsServerProcess?.toCancelOnResourceChange.delete(inFlight)
        source.dispose()
      })
    } else {
      execution = this.executeImpl(command, args, {
        isAsync: false,
        token,
        expectsResult: true,
        ...config,
      })
    }

    if (config?.nonRecoverable) {
      execution.catch(err => this.fatalError(command, err))
    }
    return execution
  }

  private fatalError(command: string, error: any): void {
    this.error(`A non-recoverable error occured while executing tsserver command: ${command}`)
    if (this.state === ServiceStat.Running) {
      this.info('Killing TS Server by fatal error:', error)
      let { tsServerProcess } = this
      if (tsServerProcess) {
        this.tsServerProcess = undefined
        tsServerProcess.kill()
      }
    }
  }

  public executeAsync(
    command: string, args: Proto.GeterrRequestArgs,
    token: CancellationToken): Promise<ServerResponse.Response<Proto.Response>> {
    return this.executeImpl(command, args, {
      isAsync: true,
      token,
      expectsResult: true
    })
  }

  public executeWithoutWaitingForResponse(command: string, args: any): void {
    this.executeImpl(command, args, {
      isAsync: false,
      token: undefined,
      expectsResult: false
    })
  }

  private executeImpl(command: string, args: any, executeInfo: { isAsync: boolean, token?: CancellationToken, expectsResult: false, lowPriority?: boolean }): undefined
  private executeImpl(command: string, args: any, executeInfo: { isAsync: boolean, token?: CancellationToken, expectsResult: boolean, lowPriority?: boolean }): Promise<ServerResponse.Response<Proto.Response>>
  private executeImpl(command: string, args: any, executeInfo: { isAsync: boolean, token?: CancellationToken, expectsResult: boolean, lowPriority?: boolean }): Promise<ServerResponse.Response<Proto.Response>> | undefined {
    if (!this.tsServerProcess) {
      return Promise.resolve(undefined)
    }
    this.bufferSyncSupport.beforeCommand(command)

    const request = this._requestQueue.createRequest(command, args)
    const requestInfo: RequestItem = {
      request,
      expectsResponse: executeInfo.expectsResult,
      isAsync: executeInfo.isAsync,
      queueingType: getQueueingType(command, executeInfo.lowPriority)
    }
    let result: Promise<ServerResponse.Response<Proto.Response>> | undefined
    if (executeInfo.expectsResult) {
      result = new Promise<ServerResponse.Response<Proto.Response>>((resolve, reject) => {
        this._callbacks.add(request.seq, { onSuccess: resolve, onError: reject, startTime: Date.now(), isAsync: executeInfo.isAsync }, executeInfo.isAsync)

        if (executeInfo.token) {
          executeInfo.token.onCancellationRequested(() => {
            this.tryCancelRequest(request.seq, command)
          })
        }
      }).catch((err: Error) => {
        throw err
      })
    }

    this._requestQueue.enqueue(requestInfo)
    this.sendNextRequests()
    return result
  }

  private sendNextRequests(): void {
    while (this._pendingResponses.size === 0 && this._requestQueue.length > 0) {
      const item = this._requestQueue.dequeue()
      if (item) {
        this.sendRequest(item)
      }
    }
  }

  private sendRequest(requestItem: RequestItem): void {
    const serverRequest = requestItem.request
    this.tracer.traceRequest(serverRequest, requestItem.expectsResponse, this._requestQueue.length)

    if (requestItem.expectsResponse && !requestItem.isAsync) {
      this._pendingResponses.add(requestItem.request.seq)
    }
    if (!this.tsServerProcess) return
    try {
      this.tsServerProcess.write(serverRequest)
    } catch (err) {
      const callback = this.fetchCallback(serverRequest.seq)
      if (callback) {
        callback.onError(err)
      }
    }
  }

  private tryCancelRequest(seq: number, command: string): boolean {
    try {
      if (this._requestQueue.tryDeletePendingRequest(seq)) {
        this.tracer.logTrace(`TypeScript Server: canceled request with sequence number ${seq}`)
        return true
      }

      if (this.cancellationPipeName) {
        this.tracer.logTrace(`TypeScript Server: trying to cancel ongoing request with sequence number ${seq}`)
        try {
          fs.writeFileSync(this.cancellationPipeName + seq, '')
        } catch {
          // noop
        }
        return true
      }

      this.tracer.logTrace(`TypeScript Server: tried to cancel request with sequence number ${seq}. But request got already delivered.`)
      return false
    } finally {
      const callback = this.fetchCallback(seq)
      if (callback) {
        callback.onSuccess(new ServerResponse.Cancelled(`Cancelled request ${seq} - ${command}`))
      }
    }
  }

  private fetchCallback(seq: number): any {
    const callback = this._callbacks.fetch(seq)
    if (!callback) {
      return undefined
    }
    this._pendingResponses.delete(seq)
    return callback
  }

  private dispatchMessage(message: Proto.Message): void {
    try {
      switch (message.type) {
        case 'response':
          this.dispatchResponse(message as Proto.Response)
          break

        case 'event':
          const event = message as Proto.Event
          if (event.event === 'requestCompleted') {
            const seq = (event as Proto.RequestCompletedEvent).body.request_seq
            const p = this._callbacks.fetch(seq)
            if (p) {
              this.tracer.traceRequestCompleted('requestCompleted', seq, p.startTime)
              p.onSuccess(undefined)
            }
          } else {
            this.tracer.traceEvent(event)
            this.dispatchEvent(event)
          }
          break

        default:
          throw new Error(`Unknown message type ${message.type} received`)
      }
    } finally {
      this.sendNextRequests()
    }
  }

  private dispatchResponse(response: Proto.Response): void {
    const callback = this.fetchCallback(response.request_seq)
    if (!callback) {
      return
    }

    this.tracer.traceResponse(response, callback.startTime)
    if (response.success) {
      callback.onSuccess(response)
    } else if (response.message === 'No content available.') {
      // Special case where response itself is successful but there is not any data to return.
      callback.onSuccess(ServerResponse.NoContent)
    } else {
      callback.onError(new Error(response.message))
    }
  }

  private dispatchEvent(event: Proto.Event): void {
    switch (event.event) {
      case 'syntaxDiag':
      case 'semanticDiag':
      case 'suggestionDiag':
        const diagnosticEvent = event as Proto.DiagnosticEvent
        if (diagnosticEvent.body && diagnosticEvent.body.diagnostics) {
          this._onDiagnosticsReceived.fire({
            kind: getDiagnosticsKind(event),
            resource: this.asUrl(diagnosticEvent.body.file),
            diagnostics: diagnosticEvent.body.diagnostics
          })
        }
        break

      case 'configFileDiag':
        this._onConfigDiagnosticsReceived.fire(
          event as Proto.ConfigFileDiagnosticEvent
        )
        break

      case 'projectLanguageServiceState':
        if (event.body) {
          this._onProjectLanguageServiceStateChanged.fire(
            (event as Proto.ProjectLanguageServiceStateEvent).body
          )
        }
        break

      case 'beginInstallTypes':
        if (event.body) {
          this._onDidBeginInstallTypings.fire(
            (event as Proto.BeginInstallTypesEvent).body
          )
        }
        break

      case 'endInstallTypes':
        if (event.body) {
          this._onDidEndInstallTypings.fire(
            (event as Proto.EndInstallTypesEvent).body
          )
        }
        break
      case 'projectsUpdatedInBackground':
        const body = (event as Proto.ProjectsUpdatedInBackgroundEvent).body
        const resources = body.openFiles.map(Uri.file)
        this.bufferSyncSupport.getErr(resources)
        break
      case 'typesInstallerInitializationFailed':
        if (event.body) {
          this._onTypesInstallerInitializationFailed.fire(
            (event as Proto.TypesInstallerInitializationFailedEvent).body
          )
        }
        break
      case 'projectLoadingStart':
        this.versionStatus.loading = true
        break

      case 'projectLoadingFinish':
        this.versionStatus.loading = false
        break
    }
  }

  private getTsServerArgs(currentVersion: TypeScriptVersion): string[] {
    const args: string[] = []

    args.push('--allowLocalPluginLoads')

    if (this.apiVersion.gte(API.v250)) {
      args.push('--useInferredProjectPerProjectRoot')
    } else {
      args.push('--useSingleInferredProject')
    }

    if (this.apiVersion.gte(API.v206) && this._configuration.disableAutomaticTypeAcquisition) {
      args.push('--disableAutomaticTypingAcquisition')
    }

    if (this.apiVersion.gte(API.v222)) {
      this.cancellationPipeName = getTempFile(`tscancellation-${makeRandomHexString(20)}`)
      args.push('--cancellationPipeName', this.cancellationPipeName + '*')
    }

    const logDir = getTempDirectory()
    if (this.apiVersion.gte(API.v222)) {
      const isRoot = process.getuid && process.getuid() == 0
      if (this._configuration.tsServerLogLevel !== TsServerLogLevel.Off && !isRoot) {
        if (logDir) {
          this.tsServerLogFile = path.join(logDir, `tsserver.log`)
          this.info('TSServer log file :', this.tsServerLogFile)
        } else {
          this.tsServerLogFile = null
          this.error('Could not create TSServer log directory')
        }

        if (this.tsServerLogFile) {
          args.push(
            '--logVerbosity',
            TsServerLogLevel.toString(this._configuration.tsServerLogLevel)
          )
          args.push('--logFile', this.tsServerLogFile)
        }
      }
    }

    if (this._configuration.enableTsServerTracing) {
      let tsServerTraceDirectory = createTempDirectory(`tsserver-trace-${makeRandomHexString(5)}`)
      if (tsServerTraceDirectory) {
        args.push('--traceDirectory', tsServerTraceDirectory)
        this.info('TSServer trace directory :', tsServerTraceDirectory)
      } else {
        this.error('Could not create TSServer trace directory')
      }
    }

    if (this.apiVersion.gte(API.v230)) {
      const pluginNames = this.pluginManager.plugins.map(x => x.name)
      let pluginPaths = this._configuration.tsServerPluginPaths
      pluginPaths = pluginPaths.reduce((p, c) => {
        if (path.isAbsolute(c)) {
          p.push(c)
        } else {
          let roots = workspace.workspaceFolders.map(o => Uri.parse(o.uri).fsPath)
          p.push(...roots.map(r => path.join(r, c)))
        }
        return p
      }, [])

      if (pluginNames.length) {
        const isUsingBundledTypeScriptVersion = currentVersion.path == this.versionProvider.bundledVersion.path
        args.push('--globalPlugins', pluginNames.join(','))
        for (const plugin of this.pluginManager.plugins) {
          if (isUsingBundledTypeScriptVersion || plugin.enableForWorkspaceTypeScriptVersions) {
            pluginPaths.push(plugin.path)
          }
        }
      }

      if (pluginPaths.length) {
        args.push('--pluginProbeLocations', pluginPaths.join(','))
      }
    }

    if (this._configuration.locale) {
      args.push('--locale', this._configuration.locale)
    }

    if (this._configuration.typingsCacheLocation) {
      args.push('--globalTypingsCacheLocation', `"${this._configuration.typingsCacheLocation}"`)
    }

    if (this.apiVersion.gte(API.v234)) {
      let { npmLocation } = this._configuration
      if (npmLocation) {
        this.logger.info(`using npm from ${npmLocation}`)
        args.push('--npmLocation', `"${npmLocation}"`)
      }
    }

    if (this.apiVersion.gte(API.v291)) {
      args.push('--noGetErrOnBackgroundUpdate')
    }

    if (this.apiVersion.gte(API.v345)) {
      args.push('--validateDefaultNpmLocation')
    }
    return args
  }

  public getProjectRootPath(uri: string): string | undefined {
    let root = workspace.cwd
    let u = Uri.parse(uri)
    if (u.scheme !== 'file') return undefined
    let folder = workspace.getWorkspaceFolder(uri)
    if (folder) {
      root = Uri.parse(folder.uri).fsPath
    } else {
      let filepath = Uri.parse(uri).fsPath
      if (!filepath.startsWith(root)) {
        root = path.dirname(filepath)
      }
    }
    if (root == os.homedir()) return undefined
    return root
  }

  public configurePlugin(pluginName: string, configuration: {}): any {
    if (this.apiVersion.gte(API.v314)) {
      if (!this.tsServerProcess) return
      this.executeWithoutWaitingForResponse('configurePlugin', { pluginName, configuration })
    }
  }

  public interruptGetErr<R>(f: () => R): R {
    return this.bufferSyncSupport.interuptGetErr(f)
  }

  private cancelInflightRequestsForResource(resource: string): void {
    if (this.state !== ServiceStat.Running || !this.tsServerProcess) {
      return
    }
    for (const request of this.tsServerProcess.toCancelOnResourceChange) {
      if (request.resource.toString() === resource.toString()) {
        request.cancel()
      }
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
  throw new Error('Unknown dignostics kind')
}

const fenceCommands = new Set(['change', 'close', 'open'])

function getQueueingType(
  command: string,
  lowPriority?: boolean
): RequestQueueingType {
  if (fenceCommands.has(command)) {
    return RequestQueueingType.Fence
  }
  return lowPriority ? RequestQueueingType.LowPriority : RequestQueueingType.Normal
}

function getDebugPort(): number | undefined {
  let debugBrk = process.env[process.env.remoteName ? 'TSS_REMOTE_DEBUG_BRK' : 'TSS_DEBUG_BRK']
  let value = debugBrk || process.env[process.env.remoteName ? 'TSS_REMOTE_DEBUG_BRK' : 'TSS_DEBUG_BRK']
  if (value) {
    const port = parseInt(value)
    if (!isNaN(port)) {
      return port
    }
  }
  return undefined
}
