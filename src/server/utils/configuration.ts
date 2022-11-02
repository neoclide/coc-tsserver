import { workspace, WorkspaceConfiguration } from 'coc.nvim'
import which from 'which'
import path from 'path'
import * as objects from '../utils/objects'
import os from 'os'
import * as Proto from '../protocol'

export enum TsServerLogLevel {
  Off,
  Normal,
  Terse,
  Verbose
}

export const enum SyntaxServerConfiguration {
  Never,
  Always,
  /** Use a single syntax server for every request, even on desktop */
  Auto,
}

export interface TypeScriptServiceConfiguration {
  readonly enable: boolean
  readonly useWorkspaceTsdk: boolean
  readonly locale: string | null
  readonly globalTsdk: string | null
  readonly localTsdk: string | null
  readonly npmLocation: string | null
  readonly tsServerLogLevel: TsServerLogLevel
  readonly tsServerPluginPaths: readonly string[]
  readonly implicitProjectConfiguration: ImplicitProjectConfiguration
  readonly disableAutomaticTypeAcquisition: boolean
  readonly useSyntaxServer: SyntaxServerConfiguration
  readonly enableProjectDiagnostics: boolean
  readonly maxTsServerMemory: number
  readonly watchOptions: Proto.WatchOptions | undefined
  readonly includePackageJsonAutoImports: 'auto' | 'on' | 'off' | undefined
  readonly enableTsServerTracing: boolean
}

export function areServiceConfigurationsEqual(a: TypeScriptServiceConfiguration, b: TypeScriptServiceConfiguration): boolean {
  return objects.equals(a, b)
}

export interface ServiceConfigurationProvider {
  loadFromWorkspace(): TypeScriptServiceConfiguration
}


export namespace TsServerLogLevel {
  export function fromString(value: string): TsServerLogLevel {
    switch (value && value.toLowerCase()) {
      case 'normal':
        return TsServerLogLevel.Normal
      case 'terse':
        return TsServerLogLevel.Terse
      case 'verbose':
        return TsServerLogLevel.Verbose
      case 'off':
      default:
        return TsServerLogLevel.Off
    }
  }

  export function toString(value: TsServerLogLevel): string {
    switch (value) {
      case TsServerLogLevel.Normal:
        return 'normal'
      case TsServerLogLevel.Terse:
        return 'terse'
      case TsServerLogLevel.Verbose:
        return 'verbose'
      case TsServerLogLevel.Off:
      default:
        return 'off'
    }
  }
}

export class ImplicitProjectConfiguration {

  public readonly target: string | undefined
  public readonly module: string | undefined
  public readonly checkJs: boolean
  public readonly experimentalDecorators: boolean
  public readonly strictNullChecks: boolean
  public readonly strictFunctionTypes: boolean

  constructor(configuration: WorkspaceConfiguration) {
    this.target = ImplicitProjectConfiguration.readTarget(configuration)
    this.module = ImplicitProjectConfiguration.readModule(configuration)
    this.checkJs = ImplicitProjectConfiguration.readCheckJs(configuration)
    this.experimentalDecorators = ImplicitProjectConfiguration.readExperimentalDecorators(configuration)
    this.strictNullChecks = ImplicitProjectConfiguration.readImplicitStrictNullChecks(configuration)
    this.strictFunctionTypes = ImplicitProjectConfiguration.readImplicitStrictFunctionTypes(configuration)
  }

  public isEqualTo(other: ImplicitProjectConfiguration): boolean {
    return objects.equals(this, other)
  }

  private static readTarget(configuration: WorkspaceConfiguration): string | undefined {
    return configuration.get<string>('tsserver.implicitProjectConfig.target')
  }

  private static readModule(configuration: WorkspaceConfiguration): string | undefined {
    return configuration.get<string>('tsserver.implicitProjectConfig.module')
  }

  private static readCheckJs(configuration: WorkspaceConfiguration): boolean {
    return configuration.get<boolean>('tsserver.implicitProjectConfig.checkJs')
      ?? configuration.get<boolean>('tsserver.implicitProjectConfig.checkJs', false)
  }

  private static readExperimentalDecorators(configuration: WorkspaceConfiguration): boolean {
    return configuration.get<boolean>('tsserver.implicitProjectConfig.experimentalDecorators')
      ?? configuration.get<boolean>('tsserver.implicitProjectConfig.experimentalDecorators', false)
  }

  private static readImplicitStrictNullChecks(configuration: WorkspaceConfiguration): boolean {
    return configuration.get<boolean>('tsserver.implicitProjectConfig.strictNullChecks', true)
  }

  private static readImplicitStrictFunctionTypes(configuration: WorkspaceConfiguration): boolean {
    return configuration.get<boolean>('tsserver.implicitProjectConfig.strictFunctionTypes', true)
  }
}

export class ServiceConfigurationProvider implements ServiceConfigurationProvider {

  public loadFromWorkspace(): TypeScriptServiceConfiguration {
    const configuration = workspace.getConfiguration()
    return {
      enable: this.readEnable(configuration),
      locale: this.readLocale(configuration),
      useWorkspaceTsdk: this.readUseWorkspace(configuration),
      globalTsdk: this.readGlobalTsdk(configuration),
      localTsdk: this.readLocalTsdk(configuration),
      npmLocation: this.readNpmLocation(configuration),
      tsServerLogLevel: this.readTsServerLogLevel(configuration),
      tsServerPluginPaths: this.readTsServerPluginPaths(configuration),
      implicitProjectConfiguration: new ImplicitProjectConfiguration(configuration),
      disableAutomaticTypeAcquisition: this.readDisableAutomaticTypeAcquisition(configuration),
      useSyntaxServer: this.readUseSyntaxServer(configuration),
      enableProjectDiagnostics: this.readEnableProjectDiagnostics(configuration),
      maxTsServerMemory: this.readMaxTsServerMemory(configuration),
      watchOptions: this.readWatchOptions(configuration),
      includePackageJsonAutoImports: this.readIncludePackageJsonAutoImports(configuration),
      enableTsServerTracing: this.readEnableTsServerTracing(configuration),
    }
  }

  protected readGlobalTsdk(configuration: WorkspaceConfiguration): string | null {
    const inspect = configuration.inspect('tsserver.tsdk')
    if (inspect && typeof inspect.globalValue === 'string') {
      return this.fixPathPrefixes(inspect.globalValue)
    }
    return null
  }

  protected readLocalTsdk(configuration: WorkspaceConfiguration): string | null {
    const inspect = configuration.inspect('tsserver.tsdk')
    if (inspect && typeof inspect.workspaceFolderValue === 'string') {
      return this.fixPathPrefixes(inspect.workspaceFolderValue)
    }
    return null
  }

  protected readUseWorkspace(configuration: WorkspaceConfiguration): boolean {
    const inspect = configuration.inspect('tsserver.useLocalTsdk')
    if (inspect && typeof inspect.workspaceFolderValue === 'boolean') {
      return inspect.workspaceFolderValue
    }
    return false
  }


  private fixPathPrefixes(inspectValue: string): string {
    const pathPrefixes = ['~' + path.sep]
    for (const pathPrefix of pathPrefixes) {
      if (inspectValue.startsWith(pathPrefix)) {
        return path.join(os.homedir(), inspectValue.slice(pathPrefix.length))
      }
    }
    return inspectValue
  }

  protected readTsServerLogLevel(configuration: WorkspaceConfiguration): TsServerLogLevel {
    const setting = configuration.get<string>('tsserver.log', 'off')
    return TsServerLogLevel.fromString(setting)
  }

  protected readTsServerPluginPaths(configuration: WorkspaceConfiguration): string[] {
    return configuration.get<string[]>('tsserver.pluginPaths', [])
  }

  protected readNpmLocation(configuration: WorkspaceConfiguration): string | null {
    return configuration.get<string>('tsserver.npm', null)
  }

  protected readDisableAutomaticTypeAcquisition(configuration: WorkspaceConfiguration): boolean {
    return configuration.get<boolean>('tsserver.disableAutomaticTypeAcquisition', false)
  }

  protected readEnable(configuration: WorkspaceConfiguration): boolean {
    return configuration.get<boolean>('tsserver.enable', true)
  }

  protected readLocale(configuration: WorkspaceConfiguration): string | null {
    const value = configuration.get<string>('tsserver.locale', 'auto')
    return !value || value === 'auto' ? null : value
  }

  protected readUseSyntaxServer(configuration: WorkspaceConfiguration): SyntaxServerConfiguration {
    const value = configuration.get<string>('tsserver.useSyntaxServer')
    switch (value) {
      case 'never': return SyntaxServerConfiguration.Never
      case 'always': return SyntaxServerConfiguration.Always
      case 'auto': return SyntaxServerConfiguration.Auto
    }
    return SyntaxServerConfiguration.Auto
  }

  protected readEnableProjectDiagnostics(configuration: WorkspaceConfiguration): boolean {
    return configuration.get<boolean>('tsserver.experimental.enableProjectDiagnostics', false)
  }

  protected readWatchOptions(configuration: WorkspaceConfiguration): Proto.WatchOptions | undefined {
    return configuration.get<Proto.WatchOptions>('tsserver.watchOptions')
  }

  protected readIncludePackageJsonAutoImports(configuration: WorkspaceConfiguration): 'auto' | 'on' | 'off' | undefined {
    return configuration.get<'auto' | 'on' | 'off'>('typescript.preferences.includePackageJsonAutoImports')
  }

  protected readMaxTsServerMemory(configuration: WorkspaceConfiguration): number {
    const defaultMaxMemory = 3072
    const minimumMaxMemory = 128
    const memoryInMB = configuration.get<number>('tsserver.maxTsServerMemory', defaultMaxMemory)
    if (!Number.isSafeInteger(memoryInMB)) {
      return defaultMaxMemory
    }
    return Math.max(memoryInMB, minimumMaxMemory)
  }

  protected readEnableTsServerTracing(configuration: WorkspaceConfiguration): boolean {
    return configuration.get<boolean>('tsserver.enableTracing', false)
  }
}
