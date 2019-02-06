import { exec } from 'child_process'
import path from 'path'
import { workspace } from 'coc.nvim'
import findUp from 'find-up'
import Uri from 'vscode-uri'

export function runCommand(cmd: string, cwd: string, timeout?: number): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let timer: NodeJS.Timer
    if (timeout) {
      timer = setTimeout(() => {
        reject(new Error(`timeout after ${timeout}s`))
      }, timeout * 1000)
    }
    exec(cmd, { cwd }, (err, stdout) => {
      if (timer) clearTimeout(timer)
      if (err) {
        reject(new Error(`exited with ${err.code}`))
        return
      }
      resolve(stdout)
    })
  })
}

function getManager(uri: string): string {
  let dir = path.dirname(Uri.parse(uri).fsPath)
  let res = findUp.sync(['yarn.lock', 'package-lock.json'], { cwd: dir })
  if (!res) return 'yarn'
  return res.endsWith('yarn.lock') ? 'yarn' : 'npm'
}

function getRoot(uri: string): string {
  let dir = path.dirname(Uri.parse(uri).fsPath)
  let res = findUp.sync(['package.json'], { cwd: dir })
  if (!res) return dir
  return path.dirname(res)
}

export async function moduleExists(name: string): Promise<boolean> {
  try {
    let content = await runCommand(`npm info ${name} --json`, process.cwd())
    if (!content) return false
    let obj = JSON.parse(content)
    if (obj.error != null) return false
    return true
  } catch (e) {
    return false
  }
  return false
}

/**
 * Removes duplicates from the given array. The optional keyFn allows to specify
 * how elements are checked for equalness by returning a unique string for each.
 */
export function distinct<T>(array: T[], keyFn?: (t: T) => string): T[] {
  if (!keyFn) {
    return array.filter((element, position) => {
      return array.indexOf(element) === position
    })
  }

  const seen: { [key: string]: boolean } = Object.create(null)
  return array.filter(elem => {
    const key = keyFn(elem)
    if (seen[key]) {
      return false
    }

    seen[key] = true

    return true
  })
}

export async function installModules(uri: string, names: string[]): Promise<void> {
  names = distinct(names)
  let root = getRoot(uri)
  let arr = names.concat(names.map(s => `@types/${s}`))
  let statusItem = workspace.createStatusBarItem(99, { progress: true })
  statusItem.text = `Checking module ${arr.join(' ')}`
  statusItem.show()
  let exists = await Promise.all(arr.map(name => {
    return moduleExists(name).then(exists => {
      return exists ? name : null
    })
  }))
  let manager = getManager(uri)
  exists = exists.filter(s => s != null)
  if (!exists.length) return
  let devs = exists.filter(s => s.startsWith('@types'))
  let deps = exists.filter(s => devs.indexOf(s) == -1)
  statusItem.text = `Installing ${exists.join(' ')}`
  try {
    await Promise.all([deps, devs].map((names, i) => {
      let cmd = manager == 'npm' ? `npm i ${names.join(' ')}` : `yarn add ${names.join(' ')} --ignore-scripts --no-default-rc`
      if (i == 1) cmd = cmd + ' --dev'
      return runCommand(cmd, root)
    }))
  } catch (e) {
    statusItem.dispose()
    workspace.showMessage(`Install error ${e.message}`, 'error')
    return
  }
  statusItem.dispose()
  workspace.showMessage(`Installed: ${exists.join(' ')}`, 'more')
}
