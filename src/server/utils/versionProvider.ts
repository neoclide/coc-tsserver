import { Uri, window, workspace } from 'coc.nvim'
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import fs from 'fs'
import path from 'path'
import API from './api'
import { TypeScriptServiceConfiguration } from './configuration'

export class TypeScriptVersion {
  private _api: API | null | undefined
  constructor(
    public readonly path: string,
    private readonly _pathLabel?: string
  ) {
    this._api = null
  }

  public get tscPath(): string {
    return path.resolve(this.path, '../bin/tsc')
  }

  public get tsServerPath(): string {
    return path.resolve(this.path, 'tsserver.js')
  }

  public get pathLabel(): string {
    return typeof this._pathLabel === 'undefined' ? this.path : this._pathLabel
  }

  public get isValid(): boolean {
    return this.version != null
  }

  public get version(): API | null {
    if (this._api) return this._api
    let api = this._api = this.getTypeScriptVersion(this.tsServerPath)
    return api
  }

  public get versionString(): string | null {
    const version = this.version
    return version ? version.versionString : null

  }

  private getTypeScriptVersion(serverPath: string): API | undefined {
    if (!fs.existsSync(serverPath)) {
      return undefined
    }

    const p = serverPath.split(path.sep)
    if (p.length <= 2) {
      return undefined
    }
    const p2 = p.slice(0, -2)
    const modulePath = p2.join(path.sep)
    let fileName = path.join(modulePath, 'package.json')
    if (!fs.existsSync(fileName)) {
      // Special case for ts dev versions
      if (path.basename(modulePath) === 'built') {
        fileName = path.join(modulePath, '..', 'package.json')
      }
    }
    if (!fs.existsSync(fileName)) {
      return undefined
    }

    const contents = fs.readFileSync(fileName).toString()
    let desc: any = null
    try {
      desc = JSON.parse(contents)
    } catch (err) {
      return undefined
    }
    if (!desc || !desc.version) {
      return undefined
    }
    return desc.version ? API.fromVersionString(desc.version) : undefined
  }
}

const MODULE_FOLDERS = ['node_modules/typescript/lib', '.vscode/pnpify/typescript/lib', '.yarn/sdks/typescript/lib']

export class TypeScriptVersionProvider {

  public constructor(private configuration: TypeScriptServiceConfiguration) {}

  public updateConfiguration(
    configuration: TypeScriptServiceConfiguration
  ): void {
    this.configuration = configuration
  }

  public getDefaultVersion(): TypeScriptVersion {
    // tsdk from configuration
    let { globalTsdk } = this.configuration
    if (globalTsdk) return new TypeScriptVersion(globalTsdk)
    return this.bundledVersion
  }

  public get globalVersion(): TypeScriptVersion | undefined {
    let { globalTsdk } = this.configuration
    if (globalTsdk) return new TypeScriptVersion(workspace.expand(globalTsdk))
    return undefined
  }

  public getLocalVersion(): TypeScriptVersion | undefined {
    let folders = workspace.workspaceFolders.map(f => Uri.parse(f.uri).fsPath)
    for (let p of folders) {
      for (let folder of MODULE_FOLDERS) {
        let libFolder = path.join(p, folder)
        if (fs.existsSync(libFolder)) {
          let version = new TypeScriptVersion(libFolder)
          if (version.isValid) return version
        }
      }
    }
    return null
  }

  public get bundledVersion(): TypeScriptVersion | null {
    try {
      const file = require.resolve('typescript')
      const bundledVersion = new TypeScriptVersion(
        path.dirname(file),
        '')
      return bundledVersion
    } catch (e) {
      window.showMessage('Bundled typescript module not found', 'error')
      return null
    }
  }
}
