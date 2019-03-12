/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { TextDocumentWillSaveEvent, workspace } from 'coc.nvim'
import { TextDocument, TextEdit, WorkspaceEdit, CancellationToken } from 'vscode-languageserver-protocol'
import { Command } from './commands'
import Proto from './protocol'
import TypeScriptServiceClientHost from './typescriptServiceClientHost'
import { standardLanguageDescriptions } from './utils/languageDescription'
import { languageIds } from './utils/languageModeIds'
import * as typeconverts from './utils/typeConverters'

export default class OrganizeImportsCommand implements Command {
  public readonly id: string = 'tsserver.organizeImports'

  constructor(
    private readonly client: TypeScriptServiceClientHost
  ) {
    workspace.onWillSaveUntil(this.onWillSaveUntil, this, 'tsserver')
  }

  private onWillSaveUntil(event: TextDocumentWillSaveEvent): void {
    let config = workspace.getConfiguration('tsserver')
    let format = config.get('orgnizeImportOnSave', false)
    if (!format) return
    let { document } = event
    if (languageIds.indexOf(document.languageId) == -1) return
    let willSaveWaitUntil = async (): Promise<TextEdit[]> => {
      let edit = await this.getTextEdits(document)
      if (!edit) return []
      return edit.changes ? edit.changes[document.uri] : []
    }
    event.waitUntil(willSaveWaitUntil())
  }

  private async getTextEdits(document: TextDocument): Promise<WorkspaceEdit | null> {
    let client = this.client.serviceClient
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
            textEdit.newText = textEdit.newText.replace(/;/g, '')
          }
        }
      }
    }
    return edit
  }

  public async execute(): Promise<void> {
    let document = await workspace.document
    if (languageIds.indexOf(document.filetype) == -1) return
    let edit = await this.getTextEdits(document.textDocument)
    if (edit) await workspace.applyEdit(edit)
    return
  }
}
