/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs'
import * as path from 'path'
import os from 'os'
import { ExtensionContext } from 'coc.nvim'
import { memoize } from '../../utils/memoize'

export interface ILogDirectoryProvider {
  getNewLogDirectory(): string | undefined
}

const base = path.join(os.tmpdir(), 'coc-tsserver-log')

export class NodeLogDirectoryProvider implements ILogDirectoryProvider {
  public constructor(
    private readonly context: ExtensionContext
  ) {}

  public getNewLogDirectory(): string | undefined {
    const root = this.logDirectory()
    if (root) {
      try {
        return fs.mkdtempSync(path.join(root, `tsserver-log-`))
      } catch (e) {
        return undefined
      }
    }
    return undefined
  }

  @memoize
  private logDirectory(): string | undefined {
    try {
      const path = base
      if (!fs.existsSync(path)) {
        fs.mkdirSync(path, { recursive: true })
      }
      return path
    } catch {
      return undefined
    }
  }
}
