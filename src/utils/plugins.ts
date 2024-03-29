/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, Emitter, extensions, disposeAll } from 'coc.nvim'
import * as arrays from './arrays'

export interface TypeScriptServerPlugin {
  readonly path: string
  readonly name: string
  readonly enableForWorkspaceTypeScriptVersions: boolean
  readonly languages: ReadonlyArray<string>
  readonly configNamespace?: string
}

namespace TypeScriptServerPlugin {
  export function equals(a: TypeScriptServerPlugin, b: TypeScriptServerPlugin): boolean {
    return a.path === b.path
      && a.name === b.name
      && a.enableForWorkspaceTypeScriptVersions === b.enableForWorkspaceTypeScriptVersions
      && arrays.equals(a.languages, b.languages)
  }
}

export class PluginManager implements Disposable {
  private readonly _pluginConfigurations = new Map<string, {}>()
  private _disposables = []

  private _plugins: Map<string, ReadonlyArray<TypeScriptServerPlugin>> | undefined

  constructor() {
    let loadPlugins = () => {
      if (!this._plugins) {
        return
      }
      const newPlugins = this.readPlugins()
      if (!arrays.equals(arrays.flatten(Array.from(this._plugins.values())), arrays.flatten(Array.from(newPlugins.values())), TypeScriptServerPlugin.equals)) {
        this._plugins = newPlugins
        this._onDidUpdatePlugins.fire(this)
      }
    }
    extensions.onDidActiveExtension(loadPlugins, undefined, this._disposables)
    extensions.onDidUnloadExtension(loadPlugins, undefined, this._disposables)
  }

  public dispose(): void {
    disposeAll(this._disposables)
  }

  public get plugins(): ReadonlyArray<TypeScriptServerPlugin> {
    if (!this._plugins) {
      this._plugins = this.readPlugins()
    }
    return arrays.flatten(Array.from(this._plugins.values()))
  }

  public _register<T extends Disposable>(value: T): T {
    this._disposables.push(value)
    return value
  }

  private readonly _onDidUpdatePlugins = this._register(new Emitter<this>())
  public readonly onDidChangePlugins = this._onDidUpdatePlugins.event

  private readonly _onDidUpdateConfig = this._register(new Emitter<{ pluginId: string, config: {} }>())
  public readonly onDidUpdateConfig = this._onDidUpdateConfig.event

  public setConfiguration(pluginId: string, config: {}): void {
    this._pluginConfigurations.set(pluginId, config)
    this._onDidUpdateConfig.fire({ pluginId, config })
  }

  public configurations(): IterableIterator<[string, {}]> {
    return this._pluginConfigurations.entries()
  }

  private readPlugins(): Map<string, ReadonlyArray<TypeScriptServerPlugin>> {
    const pluginMap = new Map<string, ReadonlyArray<TypeScriptServerPlugin>>()
    for (const extension of extensions.all) {
      const pack = extension.packageJSON
      if (pack.contributes && Array.isArray(pack.contributes.typescriptServerPlugins)) {
        const plugins: TypeScriptServerPlugin[] = []
        for (const plugin of pack.contributes.typescriptServerPlugins) {
          plugins.push({
            name: plugin.name,
            enableForWorkspaceTypeScriptVersions: !!plugin.enableForWorkspaceTypeScriptVersions,
            path: extension.extensionPath,
            languages: Array.isArray(plugin.languages) ? plugin.languages : [],
          })
        }
        if (plugins.length) {
          pluginMap.set(extension.id, plugins)
        }
      }
    }
    return pluginMap
  }
}
