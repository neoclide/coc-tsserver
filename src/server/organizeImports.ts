/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { workspace, CodeActionProvider, CodeActionProviderMetadata } from 'coc.nvim'
import { CancellationToken, Range, TextDocument, CodeActionContext, WorkspaceEdit, CodeActionKind, CodeAction } from 'vscode-languageserver-protocol'
import { Command } from './commands'
import Proto from './protocol'
import { standardLanguageDescriptions } from './utils/languageDescription'
import { languageIds } from './utils/languageModeIds'
import * as typeconverts from './utils/typeConverters'
import FileConfigurationManager from './features/fileConfigurationManager'
import TypeScriptServiceClient from './typescriptServiceClient'

export class OrganizeImportsCommand implements Command {
  public readonly id: string = 'tsserver.organizeImports'

  constructor(
    private readonly client: TypeScriptServiceClient
  ) {
  }

  private async getTextEdits(document: TextDocument): Promise<WorkspaceEdit | null> {
    let client = this.client
    let file = client.toPath(document.uri)
    const args: Proto.OrganizeImportsRequestArgs = {
      scope: {
        type: 'file',
        args: {
          file
        }
      }
    }
    const response = await client.execute('organizeImports', args, CancellationToken.None)
    if (!response || response.type != 'response' || !response.success) {
      return
    }

    const edit = typeconverts.WorkspaceEdit.fromFileCodeEdits(
      client,
      response.body
    )
    let desc = standardLanguageDescriptions.find(o => o.modeIds.indexOf(document.languageId) !== -1)
    if (!desc) return null
    const config = workspace.getConfiguration(`${desc.id}.preferences`)
    let noSemicolons = config.get<boolean>('noSemicolons', false)

    if (noSemicolons) {
      let { changes } = edit
      if (changes) {
        for (let c of Object.keys(changes)) {
          for (let textEdit of changes[c]) {
            textEdit.newText = textEdit.newText.replace(/;(?=(\n|$))/g, '')
          }
        }
      }
    }
    return edit
  }

  public async execute(document?: TextDocument): Promise<void> {
    if (!document) {
      let doc = await workspace.document
      if (languageIds.indexOf(doc.filetype) == -1) return
      document = doc.textDocument
    }
    let edit = await this.getTextEdits(document)
    if (edit) await workspace.applyEdit(edit)
    return
  }
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

  public provideCodeActions(
    document: TextDocument,
    _range: Range,
    context: CodeActionContext,
    _token: CancellationToken
  ): CodeAction[] {
    if (languageIds.indexOf(document.languageId) == -1) return

    if (!context.only || !context.only.includes(CodeActionKind.SourceOrganizeImports)) {
      return []
    }

    const action = CodeAction.create('Organize Imports', {
      title: '',
      command: 'tsserver.organizeImports',
      arguments: [document]
    }, CodeActionKind.SourceOrganizeImports)
    return [action]
  }
}
