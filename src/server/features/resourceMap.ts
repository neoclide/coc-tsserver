/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Uri } from 'coc.nvim'

function defaultPathNormalizer(resource: string): string {
  let u = Uri.parse(resource)
  if (u.scheme === 'file') {
    return u.fsPath
  }
  return resource.toString()
}

/**
 * Maps of file uris
 *
 * Attempts to handle correct mapping on both case sensitive and case in-sensitive
 * file systems.
 */
export class ResourceMap<T> {
  private readonly _map = new Map<string, { uri: string, value: T }>()

  constructor(
    protected readonly _normalizePath: (uri: string) => string | null = defaultPathNormalizer
  ) { }

  public get size() {
    return this._map.size
  }

  public get entries(): Iterable<{ uri: string, value: T }> {
    return this._map.values()
  }

  public has(uri: string): boolean {
    const file = this.toKey(uri)
    return !!file && this._map.has(file)
  }

  public get(uri: string): T | undefined {
    const file = this.toKey(uri)
    if (!file) return undefined
    let entry = this._map.get(file)
    return entry ? entry.value : undefined
  }

  public set(uri: string, value: T): void {
    const file = this.toKey(uri)
    if (file) {
      this._map.set(file, { uri, value })
    }
  }

  public delete(uri: string): void {
    const file = this.toKey(uri)
    if (file) {
      this._map.delete(file)
    }
  }

  public get values(): Iterable<T> {
    return Array.from(this._map.values()).map(x => x.value)
  }

  public get uris(): Iterable<string> {
    return Array.from(this._map.values()).map(x => x.uri)
  }

  public clear(): void {
    this._map.clear()
  }

  private toKey(uri: string): string | null {
    const key = this._normalizePath
      ? this._normalizePath(uri)
      : uri
    if (!key) {
      return key
    }
    return this.isCaseInsensitivePath(key) ? key.toLowerCase() : key
  }

  private isCaseInsensitivePath(path: string): boolean {
    if (isWindowsPath(path)) {
      return true
    }
    return path[0] === '/' && this.onIsCaseInsenitiveFileSystem
  }

  private get onIsCaseInsenitiveFileSystem(): boolean {
    if (process.platform === 'win32') {
      return true
    }
    if (process.platform === 'darwin') {
      return true
    }
    return false
  }
}

export function isWindowsPath(path: string): boolean {
  return /^[a-zA-Z]:\\/.test(path)
}
