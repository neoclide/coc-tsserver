import { CodeActionProvider, workspace } from 'coc.nvim'
import BufferSyncSupport from './bufferSyncSupport'
import { Range, CodeActionContext, CancellationToken, CodeAction } from 'vscode-languageserver-protocol'
import { TextDocument } from 'coc.nvim'
import { nodeModules } from '../utils/helper'
import { WorkspaceEdit, Command, TextEdit } from 'vscode-languageserver-types'

export default class ImportFixProvider implements CodeActionProvider {

  constructor(
    private readonly bufferSyncSupport: BufferSyncSupport,
  ) {

  }

  public async provideCodeActions(
    document: TextDocument,
    _range: Range,
    context: CodeActionContext,
    _token: CancellationToken
  ): Promise<CodeAction[]> {

    if (this.bufferSyncSupport.hasPendingDiagnostics(document.uri)) {
      return []
    }
    let diagnostics = context.diagnostics.filter(d => d.code == 2304)
    if (!diagnostics.length) return []
    let edits: TextEdit[] = []
    let names: string[] = []
    let doc = workspace.getDocument(document.uri)
    let command: string
    for (const diagnostic of diagnostics) {
      let { range } = diagnostic
      let line = doc.getline(range.start.line)
      let name = line.slice(range.start.character, range.end.character)
      if (names.indexOf(name) !== -1) continue
      if (nodeModules.indexOf(name) !== -1) {
        names.push(name)
        edits.push({
          range: Range.create(0, 0, 0, 0),
          newText: `import ${name} from '${name}'\n`
        })
        command = 'tsserver.organizeImports'
      }
    }
    let edit: WorkspaceEdit = {
      changes: {
        [document.uri]: edits
      }
    }
    let cmd: Command = null
    if (command) cmd = {
      title: `fix import`,
      command: 'tsserver.organizeImports'
    }
    return [{
      title: `Add import ${names.join(', ')}`,
      edit,
      command: cmd
    }]
  }

}
