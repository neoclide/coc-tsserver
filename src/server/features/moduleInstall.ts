import { Uri, commands } from 'coc.nvim'
import { Command } from 'coc.nvim/lib/commands'
import { CodeActionProvider } from 'coc.nvim/lib/provider'
import { CancellationToken, CodeAction, CodeActionContext, CodeActionKind, Range } from 'vscode-languageserver-protocol'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { ITypeScriptServiceClient } from '../typescriptService'
import { installModules } from '../utils/modules'

class InstallModuleCommand implements Command {
  public static readonly ID = '_tsserver.installModule'
  public readonly id = InstallModuleCommand.ID

  public async execute(
    uri: string,
    name: string
  ): Promise<void> {
    await installModules(uri, [name])
  }
}

export default class InstallModuleProvider implements CodeActionProvider {

  constructor(private readonly client: ITypeScriptServiceClient) {
    commands.register(new InstallModuleCommand(), true)
  }

  public async provideCodeActions(
    document: TextDocument,
    _range: Range,
    context: CodeActionContext,
    _token: CancellationToken
  ): Promise<CodeAction[] | null> {
    const uri = Uri.parse(document.uri)
    if (uri.scheme != 'file') return null
    let { diagnostics } = context
    let diags = diagnostics.filter(s => s.code == 2307)
    let names = diags.map(o => {
      let ms = o.message.match(/module\s'(.+)'/)
      return ms ? ms[1] : null
    })
    names = names.filter(s => s != null)
    if (!names.length) return null
    let actions: CodeAction[] = []
    for (let name of names) {
      let title = `install ${name}`
      let command = {
        title: `install ${name}`,
        command: InstallModuleCommand.ID,
        arguments: [document.uri, name]
      }
      let codeAction = CodeAction.create(title, command, CodeActionKind.QuickFix)
      actions.push(codeAction)
    }
    return actions
  }
}
