/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Uri, RenameProvider, workspace } from 'coc.nvim'
import path from 'path'
import { CancellationToken, Position, Range, TextEdit, WorkspaceEdit } from 'vscode-languageserver-protocol'
import { TextDocument } from 'coc.nvim'
import * as languageModeIds from '../utils/languageModeIds'
import * as Proto from '../protocol'
import { ITypeScriptServiceClient } from '../typescriptService'
import API from '../utils/api'
import * as typeConverters from '../utils/typeConverters'
import FileConfigurationManager from './fileConfigurationManager'
import { LanguageDescription } from '../utils/languageDescription'

type RenameResponse = {
  readonly type: 'rename'
  readonly body: Proto.RenameResponseBody
} | {
  readonly type: 'jsxLinkedEditing'
  readonly spans: readonly Proto.TextSpan[]
}

function comparePosition(position: Position, other: Position): number {
  if (position.line > other.line) return 1
  if (other.line == position.line && position.character > other.character) return 1
  if (other.line == position.line && position.character == other.character) return 0
  return -1
}

function positionInRange(position: Position, range: Range): number {
  let { start, end } = range
  if (comparePosition(position, start) < 0) return -1
  if (comparePosition(position, end) > 0) return 1
  return 0
}

export default class TypeScriptRenameProvider implements RenameProvider {
  public constructor(
    private readonly language: LanguageDescription,
    private readonly client: ITypeScriptServiceClient,
    private readonly fileConfigurationManager: FileConfigurationManager
  ) {}

  public async prepareRename(
    document: TextDocument,
    position: Position,
    token: CancellationToken
  ): Promise<Range | undefined> {
    if (this.client.apiVersion.lt(API.v310)) {
      return undefined
    }
    const response = await this.execRename(document, position, token)
    if (!response) {
      return undefined
    }

    switch (response.type) {
      case 'rename':
        const renameInfo = response.body.info
        if (!renameInfo.canRename) {
          return Promise.reject(new Error('Invalid location for rename.'))
        }
        const triggerSpan = (renameInfo as any).triggerSpan
        if (triggerSpan) {
          return typeConverters.Range.fromTextSpan(triggerSpan)
        }
        break

      case 'jsxLinkedEditing': {
        return response.spans.map(typeConverters.Range.fromTextSpan).find(range => positionInRange(position, range) === 0)
      }
    }
  }

  public async provideRenameEdits(
    document: TextDocument,
    position: Position,
    newName: string,
    token: CancellationToken
  ): Promise<WorkspaceEdit | undefined> {
    if (this.client.apiVersion.lt(API.v310)) {
      return undefined
    }
    const file = this.client.toOpenedFilePath(document.uri)
    if (!file) {
      return undefined
    }

    const response = await this.execRename(document, position, token)
    if (!response || token.isCancellationRequested) {
      return undefined
    }

    switch (response.type) {
      case 'rename': {
        const renameInfo = response.body.info
        if (!renameInfo.canRename) {
          return Promise.reject(new Error('Invalid location for rename.'))
        }
        if (renameInfo.fileToRename) {
          const edits = await this.renameFile(renameInfo.fileToRename, newName, token)
          if (edits) {
            return edits
          } else {
            return Promise.reject(new Error('An error occurred while renaming file'))
          }
        }

        return this.toWorkspaceEdit(response.body.locs, newName)
      }
      case 'jsxLinkedEditing': {
        const locations = [
          {
            file,
            locs: response.spans.map((span): Proto.RenameTextSpan => ({ ...span })),
          }
        ]
        return this.toWorkspaceEdit(locations, newName)
      }
    }
  }

  public async execRename(
    document: TextDocument,
    position: Position,
    token: CancellationToken
  ): Promise<RenameResponse | undefined> {
    const file = this.client.toPath(document.uri)
    if (!file) return undefined

    // Prefer renaming matching jsx tag when available
    const renameMatchingJsxTags = workspace.getConfiguration(this.language.id).get('preferences.renameMatchingJsxTags', true)
    if (this.client.apiVersion.gte(API.v510) && renameMatchingJsxTags && this.looksLikePotentialJsxTagContext(document, position)) {
      const args = typeConverters.Position.toFileLocationRequestArgs(file, position);
      const response = await this.client.execute('linkedEditingRange', args, token);
      if (response.type !== 'response' || !response.body) {
        return undefined;
      }

      return { type: 'jsxLinkedEditing', spans: response.body.ranges };
    }

    const args: Proto.RenameRequestArgs = {
      ...typeConverters.Position.toFileLocationRequestArgs(file, position),
      findInStrings: false,
      findInComments: false
    }
    await this.fileConfigurationManager.ensureConfigurationForDocument(document, token)

    return this.client.interruptGetErr(async () => {
      const response = await this.client.execute('rename', args, token);
      if (response.type !== 'response' || !response.body) {
        return undefined;
      }
      return { type: 'rename', body: response.body };
    })
  }

  private looksLikePotentialJsxTagContext(document: TextDocument, position: Position): boolean {
    if (![languageModeIds.typescriptreact, languageModeIds.javascript, languageModeIds.javascriptreact].includes(document.languageId)) {
      return false;
    }

    const prefix = document.getText(Range.create(position.line, 0, position.line, position.character))
    return /\<\/?\s*[\w\d_$.]*$/.test(prefix);
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
