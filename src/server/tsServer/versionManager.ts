/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TypeScriptServiceConfiguration } from '../utils/configuration'
import { TypeScriptVersionProvider, TypeScriptVersion } from './versionProvider'
import fs from 'fs'

export class TypeScriptVersionManager {

  private _currentVersion: TypeScriptVersion

  public constructor(
    private configuration: TypeScriptServiceConfiguration,
    private readonly versionProvider: TypeScriptVersionProvider,
    tscPathVim: string | undefined,
  ) {
    if (tscPathVim && fs.existsSync(tscPathVim)) {
      this._currentVersion = versionProvider.getVersionFromTscPath(tscPathVim)
      if (this._currentVersion.isValid) return
    }

    this._currentVersion = this.versionProvider.getDefaultVersion()

    if (this.useWorkspaceTsdkSetting) {
      const localVersion = this.versionProvider.getLocalVersion()
      if (localVersion) {
        this._currentVersion = localVersion
      }
    }
  }

  public updateConfiguration(nextConfiguration: TypeScriptServiceConfiguration) {
    this.configuration = nextConfiguration
    if (this.useWorkspaceTsdkSetting) {
      const localVersion = this.versionProvider.getLocalVersion()
      if (localVersion) {
        this._currentVersion = localVersion
      }
    } else {
      this._currentVersion = this.versionProvider.getDefaultVersion()
    }
  }

  public get currentVersion(): TypeScriptVersion {
    return this._currentVersion
  }

  public reset(): void {
    this._currentVersion = this.versionProvider.bundledVersion
  }

  private get useWorkspaceTsdkSetting(): boolean {
    return this.configuration.useWorkspaceTsdk
  }
}
