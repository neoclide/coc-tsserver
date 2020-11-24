import { workspace, WorkspaceConfiguration } from 'coc.nvim'
import which from 'which'

export enum TsServerLogLevel {
  Off,
  Normal,
  Terse,
  Verbose
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

export class TypeScriptServiceConfiguration {
  private _configuration: WorkspaceConfiguration
  private constructor() {
    this._configuration = workspace.getConfiguration('tsserver')

    workspace.onDidChangeConfiguration(() => {
      this._configuration = workspace.getConfiguration('tsserver')
    })
  }

  public get locale(): string | null {
    return this._configuration.get<string | null>('locale', null)
  }

  public get globalTsdk(): string | null {
    return this._configuration.get<string | null>('tsdk', null)
  }

  public get ignoreLocalTsserver(): boolean {
    return this._configuration.get<boolean>('ignoreLocalTsserver', false)
  }

  public get tsServerLogLevel(): TsServerLogLevel {
    return TsServerLogLevel.fromString(this._configuration.get<string | null>('log', null))
  }

  // public readonly watchOptions: protocol.WatchOptions | undefined;
  public get watchOptions(): protocol.WatchOptions | undefined {
    return this._configuration.get<protocol.WatchOptions>('watchOptions')
  }

  public get typingsCacheLocation(): string {
    return this._configuration.get<string>('typingsCacheLocation', '')
  }

  public get tsServerPluginPaths(): string[] {
    return this._configuration.get<string[]>('pluginPaths', [])
  }

  public get checkJs(): boolean {
    return this._configuration.get<boolean>('implicitProjectConfig.checkJs', false)
  }

  public get experimentalDecorators(): boolean {
    return this._configuration.get<boolean>('implicitProjectConfig.experimentalDecorators', false)
  }

  public get disableAutomaticTypeAcquisition(): boolean {
    return this._configuration.get<boolean>('disableAutomaticTypeAcquisition', false)
  }

  public get formatOnType(): boolean {
    return this._configuration.get<boolean>('formatOnType', false)
  }

  public get maxTsServerMemory(): number {
    return this._configuration.get<number>('maxTsServerMemory', 0)
  }

  public get debugPort(): number | null {
    return this._configuration.get<number>('debugPort', parseInt(process.env['TSS_DEBUG'], 10))
  }

  public get npmLocation(): string | null {
    let path = this._configuration.get<string>('npm', '')
    if (path) return workspace.expand(path)
    try {
      path = which.sync('npm')
    } catch (e) {
      return null
    }
    return path
  }

  public static loadFromWorkspace(): TypeScriptServiceConfiguration {
    return new TypeScriptServiceConfiguration()
  }
}
