import os from 'os'
import path from 'path'
import { Uri } from 'coc.nvim'

const caseInsensitive = os.platform() === 'win32' || os.platform() === 'darwin'

export function fileStartsWith(dir: string, pdir: string) {
  if (caseInsensitive) return dir.toLowerCase().startsWith(pdir.toLowerCase())
  return dir.startsWith(pdir)
}

export function normalizeFilePath(filepath: string) {
  return Uri.file(path.resolve(path.normalize(filepath))).fsPath
}

export function isParentFolder(folder: string, filepath: string): boolean {
  let pdir = normalizeFilePath(folder)
  let dir = normalizeFilePath(filepath)
  return fileStartsWith(dir, pdir) && dir[pdir.length] == path.sep
}
