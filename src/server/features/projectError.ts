import { disposeAll, workspace } from 'coc.nvim'
import { Command, CommandManager } from 'coc.nvim/lib/commands'
import { Disposable, CancellationToken } from 'vscode-languageserver-protocol'
import * as Proto from '../protocol'
import { ITypeScriptServiceClient } from '../typescriptService'
import * as languageIds from '../utils/languageModeIds'

class ProjectErrorCommand implements Command {
  public readonly id: string = 'tsserver.project_error'

  constructor(
    private readonly client: ITypeScriptServiceClient
  ) {
  }

  public async execute(): Promise<void> {
    let document = await workspace.document
    if (languageIds[document.filetype] == null) return
    let file = this.client.toPath(document.uri)
    const args: Proto.GeterrForProjectRequestArgs = {
      file,
      delay: 20
    }
    const response = null
    // await this.client.execute('geterrForProject', args, CancellationToken.None)
    if (!response || !response.success) {
      return
    }

    return
  }
}

export default class ProjectErrors {
  private disposables: Disposable[] = []
  public constructor(
    client: ITypeScriptServiceClient,
    commandManager: CommandManager
  ) {
    let cmd = new ProjectErrorCommand(client)
    commandManager.register(cmd)
    this.disposables.push(Disposable.create(() => {
      commandManager.unregister(cmd.id)
    }))
  }

  public dispose(): void {
    disposeAll(this.disposables)
  }
}
