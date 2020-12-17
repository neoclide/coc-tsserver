import { CodeActionProvider, commands, TextDocument, Uri } from 'coc.nvim'
import { CancellationToken, CodeAction, CodeActionContext, CodeActionKind, Range } from 'vscode-languageserver-protocol'
import { ITypeScriptServiceClient } from '../typescriptService'
import { installModules } from '../utils/modules'

export default class InstallModuleProvider implements CodeActionProvider {

  constructor(private readonly client: ITypeScriptServiceClient) {
    commands.registerCommand('_tsserver.installModule', async (uri: string, name: string) => {
      await installModules(uri, [name])
    })
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
        command: '_tsserver.installModule',
        arguments: [document.uri, name]
      }
      let codeAction = CodeAction.create(title, command, CodeActionKind.QuickFix)
      actions.push(codeAction)
    }
    return actions
  }
}
