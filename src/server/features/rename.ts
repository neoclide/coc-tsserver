/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Uri, RenameProvider } from 'coc.nvim'
import path from 'path'
import { CancellationToken, Position, Range, TextEdit, WorkspaceEdit } from 'vscode-languageserver-protocol'
import { TextDocument } from 'coc.nvim'
import * as Proto from '../protocol'
import { ITypeScriptServiceClient, ServerResponse } from '../typescriptService'
import API from '../utils/api'
import * as typeConverters from '../utils/typeConverters'
import FileConfigurationManager from './fileConfigurationManager'

export default class TypeScriptRenameProvider implements RenameProvider {
  public constructor(
    private readonly client: ITypeScriptServiceClient,
    private readonly fileConfigurationManager: FileConfigurationManager
  ) { }

  public async prepareRename(
    document: TextDocument,
    position: Position,
    token: CancellationToken
  ): Promise<Range | null> {
    const response = await this.execRename(document, position, token)
    if (!response || response.type !== 'response' || !response.body) {
      return null
    }

    const renameInfo = response.body.info
    if (!renameInfo.canRename) {
      return Promise.reject(new Error('Invalid location for rename.'))
    }

    if (this.client.apiVersion.gte(API.v310)) {
      const triggerSpan = (renameInfo as any).triggerSpan
      if (triggerSpan) {
        const range = typeConverters.Range.fromTextSpan(triggerSpan)
        return range
      }
    }
    return null
  }

  public async provideRenameEdits(
    document: TextDocument,
    position: Position,
    newName: string,
    token: CancellationToken
  ): Promise<WorkspaceEdit | null> {
    const response = await this.execRename(document, position, token)
    if (!response || response.type !== 'response' || !response.body) {
      return null
    }

    const renameInfo = response.body.info
    if (!renameInfo.canRename) {
      return Promise.reject(new Error('Invalid location for rename.'))
    }

    if (this.client.apiVersion.gte(API.v310)) {
      if ((renameInfo as any).fileToRename) {
        const edits = await this.renameFile((renameInfo as any).fileToRename, newName, token)
        if (edits) {
          return edits
        } else {
          return Promise.reject(new Error('An error occurred while renaming file'))
        }
      }
    }
    return this.toWorkspaceEdit(response.body.locs, newName)
  }

  public async execRename(
    document: TextDocument,
    position: Position,
    token: CancellationToken
  ): Promise<ServerResponse.Response<Proto.RenameResponse> | undefined> {
    const file = this.client.toPath(document.uri)
    if (!file) return undefined

    const args: Proto.RenameRequestArgs = {
      ...typeConverters.Position.toFileLocationRequestArgs(file, position),
      findInStrings: false,
      findInComments: false
    }
    await this.fileConfigurationManager.ensureConfigurationForDocument(document, token)

    return this.client.interruptGetErr(() => {
      return this.client.execute('rename', args, token)
    })
  }

  private toWorkspaceEdit(
    locations: ReadonlyArray<Proto.SpanGroup>,
    newName: string
  ): WorkspaceEdit {
    let changes: { [uri: string]: TextEdit[] } = {}
    for (const spanGroup of locations) {
      const uri = this.client.toResource(spanGroup.file)
      if (uri) {
        changes[uri] = []
        for (const textSpan of spanGroup.locs) {
          changes[uri].push({
            range: typeConverters.Range.fromTextSpan(textSpan),
            newText: (textSpan.prefixText || '') + newName + (textSpan.suffixText || '')
          })
        }
      }
    }
    return { changes }
  }

  private async renameFile(
    fileToRename: string,
    newName: string,
    token: CancellationToken,
  ): Promise<WorkspaceEdit | undefined> {
    // Make sure we preserve file exension if none provided
    if (!path.extname(newName)) {
      newName += path.extname(fileToRename)
    }

    const dirname = path.dirname(fileToRename)
    const newFilePath = path.join(dirname, newName)

    const args: Proto.GetEditsForFileRenameRequestArgs & { file: string } = {
      file: fileToRename,
      oldFilePath: fileToRename,
      newFilePath
    }
    const response = await this.client.execute('getEditsForFileRename', args, token)
    if (response.type !== 'response' || !response.body) {
      return undefined
    }

    const edits = typeConverters.WorkspaceEdit.fromFileCodeEdits(this.client, response.body)

    edits.documentChanges = edits.documentChanges || []
    edits.documentChanges.push({
      kind: 'rename',
      oldUri: Uri.file(fileToRename).toString(),
      newUri: Uri.file(newFilePath).toString(),
      options: {
        overwrite: false,
        ignoreIfExists: true
      }
    })
    return edits
  }

}
