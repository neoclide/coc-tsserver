import path from 'path'
import os from 'os'
import fs from 'fs'

export function getParentDirs(fullpath: string): string[] {
  let obj = path.parse(fullpath)
  if (!obj || !obj.root) return []
  let res = []
  let p = path.dirname(fullpath)
  while (p && p !== obj.root) {
    res.push(p)
    p = path.dirname(p)
  }
  return res
}

export function resolveRoot(cwd: string, subs: string[], home?: string): string | null {
  home = home || os.homedir()
  let { root } = path.parse(cwd)
  let paths = getParentDirs(cwd)
  paths.unshift(cwd)
  for (let p of paths) {
    if (p == home || p == root) return null
    for (let sub of subs) {
      let d = path.join(p, sub)
      if (fs.existsSync(d)) return path.dirname(d)
    }
  }
  return root
}
