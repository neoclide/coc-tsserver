import { diagnosticManager, workspace } from 'coc.nvim'
import { CancellationToken } from 'vscode-languageserver-protocol'
import URI from 'vscode-uri'
import * as Proto from './protocol'
import TypeScriptServiceClientHost from './typescriptServiceClientHost'
import * as typeConverters from './utils/typeConverters'
import { WorkspaceEdit, TextEdit } from 'vscode-languageserver-types'

export interface Command {
  readonly id: string | string[]
  execute(...args: any[]): void | Promise<any>
}

export class ReloadProjectsCommand implements Command {
  public readonly id = 'tsserver.reloadProjects'

  public constructor(
    private readonly client: TypeScriptServiceClientHost
  ) { }

  public execute(): void {
    this.client.reloadProjects()
    workspace.showMessage('projects reloaded')
  }
}

export class OpenTsServerLogCommand implements Command {
  public readonly id = 'tsserver.openTsServerLog'

  public constructor(
    private readonly client: TypeScriptServiceClientHost
  ) { }

  public execute(): void {
    this.client.serviceClient.openTsServerLogFile() // tslint:disable-line
  }
}

export class TypeScriptGoToProjectConfigCommand implements Command {
  public readonly id = 'tsserver.goToProjectConfig'

  public constructor(
    private readonly client: TypeScriptServiceClientHost
  ) { }

  public async execute(): Promise<void> {
    let doc = await workspace.document
    await goToProjectConfig(this.client, doc.uri)
  }
}

async function goToProjectConfig(clientHost: TypeScriptServiceClientHost, uri: string): Promise<void> {
  if (!clientHost.handles(uri)) {
    workspace.showMessage('Could not determine TypeScript or JavaScript project. Unsupported file type', 'warning')
    return
  }
  const client = clientHost.serviceClient
  const file = client.toPath(uri)
  let res: Proto.ProjectInfoResponse | undefined
  try {
    res = await client.execute('projectInfo', { file, needFileNameList: false }, CancellationToken.None)
  } catch {
    // noop
  }
  if (!res || !res.body) {
    workspace.showMessage('Could not determine TypeScript or JavaScript project.', 'warning')
    return
  }

  const { configFileName } = res.body
  if (configFileName && !isImplicitProjectConfigFile(configFileName)) {
    await workspace.openResource(URI.file(configFileName).toString())
    return
  }

  workspace.showMessage('Config file not found', 'warning')
}

function isImplicitProjectConfigFile(configFileName: string): boolean {
  return configFileName.indexOf('/dev/null/') === 0
}

const autoFixableDiagnosticCodes = new Set<number>([
  2420, // Incorrectly implemented interface
  2552, // Cannot find name
  2304, // Cannot find name
])

export class AutoFixCommand implements Command {
  public readonly id = 'tsserver.executeAutofix'

  constructor(private client: TypeScriptServiceClientHost) {
  }

  public async execute(): Promise<void> {
    let document = await workspace.document
    if (!this.client.handles(document.uri)) {
      workspace.showMessage('Document is not handled by tsserver.', 'warning')
      return
    }
    let file = this.client.serviceClient.toPath(document.uri)
    let diagnostics = diagnosticManager.getDiagnostics(document.uri)
    diagnostics = diagnostics.filter(x => autoFixableDiagnosticCodes.has(x.code as number))
    if (diagnostics.length == 0) {
      workspace.showMessage('No autofixable diagnostics found', 'warning')
    }
    let client = this.client.serviceClient
    let edits: TextEdit[] = []
    for (let diagnostic of diagnostics) {
      const args: Proto.CodeFixRequestArgs = {
        ...typeConverters.Range.toFileRangeRequestArgs(file, diagnostic.range),
        errorCodes: [+(diagnostic.code!)]
      }
      const response: Proto.GetCodeFixesResponse = await client.execute('getCodeFixes', args)
      if (response.type !== 'response' || !response.body || response.body.length < 1) {
        continue
      }
      const fix = response.body[0]
      for (let change of fix.changes) {
        if (change.fileName != file) continue
        // change.fileName
        for (let ch of change.textChanges) {
          edits.push({
            range: typeConverters.Range.fromTextSpan(ch),
            newText: ch.newText
          })
        }
      }
    }
    if (edits.length) await document.applyEdits(workspace.nvim, edits)
  }
}
