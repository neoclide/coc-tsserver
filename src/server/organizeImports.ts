/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CodeActionProvider, CodeActionProviderMetadata, TextDocument, workspace } from 'coc.nvim'
import { CancellationToken, CodeAction, CodeActionContext, CodeActionKind, Range, TextEdit, WorkspaceEdit } from 'vscode-languageserver-protocol'
import TsserverService from '../server'
import { Command } from './commands'
import FileConfigurationManager from './features/fileConfigurationManager'
import Proto from './protocol'
import TypeScriptServiceClient from './typescriptServiceClient'
import * as typeconverts from './utils/typeConverters'

export class OrganizeImportsCommand implements Command {
  public readonly id: string = 'tsserver.organizeImports'

  constructor(
    private readonly service: TsserverService
  ) {
  }

  private async _execute(client: TypeScriptServiceClient, document: TextDocument, sortOnly = false): Promise<WorkspaceEdit | TextEdit[] | null> {
    let file = client.toPath(document.uri)
    const args: Proto.OrganizeImportsRequestArgs = {
      skipDestructiveCodeActions: sortOnly,
      scope: {
        type: 'file',
        args: {
          file
        }
      }
    }
    const response = await client.interruptGetErr(() => client.execute('organizeImports', args, CancellationToken.None))
    if (!response || response.type != 'response' || !response.success) {
      return
    }

    const edit = typeconverts.WorkspaceEdit.fromFileCodeEdits(
      client,
      response.body
    )
    let keys = Object.keys(edit.changes)
    if (keys.length == 1) {
      let doc = workspace.getDocument(keys[0])
      if (doc) {
        await doc.applyEdits(edit.changes[keys[0]])
        return
      }
    }
    if (edit) await workspace.applyEdit(edit)
  }

  public async execute(document?: TextDocument, sortOnly = false): Promise<void> {
    let client = await this.service.getClientHost()
    if (!document) {
      let doc = await workspace.document
      if (!doc.attached) {
        throw new Error(`Document not attached.`)
      }
      if (client.serviceClient.modeIds.indexOf(doc.filetype) == -1) {
        throw new Error(`filetype "${doc.filetype}" not supported by tsserver.`)
      }
      document = doc.textDocument
    }
    await this._execute(client.serviceClient, document, sortOnly)
  }
}

export class SourceImportsCommand extends OrganizeImportsCommand {
  public readonly id = 'tsserver.sortImports'
}

export class OrganizeImportsCodeActionProvider implements CodeActionProvider {
  // public static readonly minVersion = API.v280

  public constructor(
    private readonly client: TypeScriptServiceClient,
    private readonly fileConfigManager: FileConfigurationManager,
  ) {
  }

  public readonly metadata: CodeActionProviderMetadata = {
    providedCodeActionKinds: [CodeActionKind.SourceOrganizeImports]
  }

  public async provideCodeActions(
    document: TextDocument,
    _range: Range,
    context: CodeActionContext,
    token: CancellationToken
  ): Promise<CodeAction[]> {
    if (this.client.modeIds.indexOf(document.languageId) == -1) return

    if (!context.only || !context.only.includes(CodeActionKind.SourceOrganizeImports)) {
      return []
    }
    await this.fileConfigManager.ensureConfigurationForDocument(document, token)

    const organizeImportsAction = CodeAction.create('Organize Imports', {
      title: '',
      command: 'tsserver.organizeImports',
      arguments: [document]
    }, CodeActionKind.SourceOrganizeImports)
    const sortImportsAction = CodeAction.create('Sort Imports', {
      title: '',
      command: 'tsserver.sortImports',
      arguments: [document, true]
    }, 'source.sortImports')
    return [organizeImportsAction, sortImportsAction]
  }
}
