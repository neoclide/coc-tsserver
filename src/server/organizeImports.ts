/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken, CodeActionContext, CodeActionKind, CodeActionProvider, commands, Disposable, disposeAll, Range, TextDocument, window, workspace } from 'coc.nvim'
import { CodeAction } from 'vscode-languageserver-protocol'
import { Command } from './commands'
import FileConfigurationManager from './features/fileConfigurationManager'
import Proto from './protocol'
import { OrganizeImportsMode } from './protocol.const'
import { ITypeScriptServiceClient } from './typescriptService'
import TypeScriptServiceClient from './typescriptServiceClient'
import API from './utils/api'
import * as typeConverters from './utils/typeConverters'

interface OrganizeImportsCommandMetadata {
  readonly ids: readonly string[]
  readonly title: string
  readonly minVersion: API
  readonly kind: CodeActionKind
  readonly mode: OrganizeImportsMode
}

const organizeImportsCommand: OrganizeImportsCommandMetadata = {
  ids: ['typescript.organizeImports', 'javascript.organizeImports'],
  minVersion: API.v280,
  title: "Organize Imports",
  kind: CodeActionKind.SourceOrganizeImports,
  mode: OrganizeImportsMode.All,
}

const sortImportsCommand: OrganizeImportsCommandMetadata = {
  ids: ['typescript.sortImports', 'javascript.sortImports'],
  minVersion: API.v430,
  title: "Sort Imports",
  kind: CodeActionKind.Source + '.sortImports',
  mode: OrganizeImportsMode.SortAndCombine,
}

const removeUnusedImportsCommand: OrganizeImportsCommandMetadata = {
  ids: ['typescript.removeUnusedImports', 'javascript.removeUnusedImports'],
  minVersion: API.v490,
  title: "Remove Unused Imports",
  kind: CodeActionKind.Source + '.removeUnusedImports',
  mode: OrganizeImportsMode.RemoveUnused,
}

const allCommands = [organizeImportsCommand, sortImportsCommand, removeUnusedImportsCommand]

export function codeActionContains(kinds: CodeActionKind[], kind: CodeActionKind): boolean {
  return kinds.some(k => kind === k || kind.startsWith(k + '.'))
}

class OrganizeImportsCommand implements Command {
  constructor(
    public readonly id: string,
    private readonly commandMetadata: OrganizeImportsCommandMetadata,
    private readonly client: ITypeScriptServiceClient,
  ) {}

  public async execute(file?: string): Promise<any> {
    if (!file) {
      const activeEditor = window.activeTextEditor
      if (!activeEditor) {
        window.showErrorMessage('Organize Imports failed. No resource provided.')
        return
      }
      const resource = activeEditor.document.uri
      const openedFiledPath = this.client.toOpenedFilePath(resource)
      if (!openedFiledPath) {
        window.showErrorMessage('Organize Imports failed. Unknown file type.')
        return
      }

      file = openedFiledPath
    }

    const args: Proto.OrganizeImportsRequestArgs = {
      scope: {
        type: 'file',
        args: {
          file
        }
      },
      // Deprecated in 4.9; `mode` takes priority
      skipDestructiveCodeActions: this.commandMetadata.mode === OrganizeImportsMode.SortAndCombine,
      mode: typeConverters.OrganizeImportsMode.toProtocolOrganizeImportsMode(this.commandMetadata.mode),
    }
    const response = await this.client.interruptGetErr(() => this.client.execute('organizeImports', args, CancellationToken.None))
    if (response.type !== 'response' || !response.body) {
      return
    }

    if (response.body.length) {
      const edits = typeConverters.WorkspaceEdit.fromFileCodeEdits(this.client, response.body)
      return workspace.applyEdit(edits)
    }
  }
}

export class OrganizeImportsCodeActionProvider implements CodeActionProvider {
  private disposables: Disposable[] = []

  public constructor(
    private id: string,
    private readonly client: TypeScriptServiceClient,
    private readonly fileConfigManager: FileConfigurationManager,
  ) {
    for (let cmd of allCommands) {
      for (let commandId of cmd.ids) {
        if (!commandId.startsWith(this.id)) continue
        let command = new OrganizeImportsCommand(commandId, cmd, client)
        this.disposables.push(commands.registerCommand(command.id, command.execute, command, true))
      }
    }
  }

  public readonly metadata = {
    providedCodeActionKinds: allCommands.map(o => o.kind)
  }

  public async provideCodeActions(
    document: TextDocument,
    _range: Range,
    context: CodeActionContext,
    token: CancellationToken
  ): Promise<CodeAction[]> {
    if (!context.only) return []
    const file = this.client.toOpenedFilePath(document.uri)
    if (!file) return []

    await this.fileConfigManager.ensureConfigurationForDocument(document, token)
    let actions: CodeAction[] = []
    for (let cmd of allCommands) {
      if (!this.client.apiVersion.gte(cmd.minVersion)) continue
      if (!codeActionContains(context.only, cmd.kind)) continue
      for (let commandId of cmd.ids) {
        if (!commandId.startsWith(this.id)) continue
        let action = CodeAction.create(cmd.title, {
          title: '',
          command: commandId,
          arguments: [file]
        }, cmd.kind)
        actions.push(action)
      }
    }
    return actions
  }

  public dispose(): void {
    disposeAll(this.disposables)
  }
}
