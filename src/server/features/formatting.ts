/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { TextDocument, workspace } from 'coc.nvim'
import { DocumentFormattingEditProvider, DocumentRangeFormattingEditProvider } from 'coc.nvim'
import { CancellationToken, FormattingOptions, Position, Range, TextEdit } from 'vscode-languageserver-protocol'
import * as Proto from '../protocol'
import { ITypeScriptServiceClient } from '../typescriptService'
import * as typeConverters from '../utils/typeConverters'
import FileConfigurationManager from './fileConfigurationManager'

export default class TypeScriptFormattingProvider
  implements
  DocumentRangeFormattingEditProvider,
  DocumentFormattingEditProvider {
  public constructor(
    private readonly client: ITypeScriptServiceClient,
    private readonly formattingOptionsManager: FileConfigurationManager
  ) {
  }

  private enabled(document: TextDocument): boolean {
    return this.formattingOptionsManager.formatEnabled(document)
  }

  private async doFormat(
    document: TextDocument,
    options: FormattingOptions,
    args: Proto.FormatRequestArgs,
    token?: CancellationToken
  ): Promise<TextEdit[]> {
    if (!this.enabled(document)) return []
    await this.formattingOptionsManager.ensureConfigurationOptions(
      document,
      options.insertSpaces,
      options.tabSize,
      token
    )
    try {
      const response = await this.client.execute('format', args, token)
      if (response.type == 'response' && response.body) {
        let edits = response.body.map(typeConverters.TextEdit.fromCodeEdit)
        return edits
      }
    } catch {
      // noop
    }
    return []
  }

  public async provideDocumentRangeFormattingEdits(
    document: TextDocument,
    range: Range,
    options: FormattingOptions,
    token: CancellationToken
  ): Promise<TextEdit[]> {
    if (!this.enabled(document)) return []
    const filepath = this.client.toPath(document.uri)
    if (!filepath) return []
    const args: Proto.FormatRequestArgs = {
      file: filepath,
      line: range.start.line + 1,
      offset: range.start.character + 1,
      endLine: range.end.line + 1,
      endOffset: range.end.character + 1
    }
    return this.doFormat(document, options, args, token)
  }

  public async provideDocumentFormattingEdits(
    document: TextDocument,
    options: FormattingOptions,
    token?: CancellationToken
  ): Promise<TextEdit[]> {
    if (!this.enabled(document)) return []
    const filepath = this.client.toPath(document.uri)
    if (!filepath) return []
    const args: Proto.FormatRequestArgs = {
      file: filepath,
      line: 1,
      offset: 1,
      endLine: document.lineCount + 1,
      endOffset: 1
    }
    return this.doFormat(document, options, args, token)
  }

  public async provideOnTypeFormattingEdits(
    document: TextDocument,
    position: Position,
    ch: string,
    options: FormattingOptions,
    token: CancellationToken
  ): Promise<TextEdit[]> {
    if (!this.enabled(document)) return []
    if (!this.client.configuration.formatOnType) return []
    const file = this.client.toPath(document.uri)
    if (!file) return []

    await this.formattingOptionsManager.ensureConfigurationOptions(
      document,
      options.insertSpaces,
      options.tabSize,
      token
    )
    const doc = workspace.getDocument(document.uri)

    const args: Proto.FormatOnKeyRequestArgs = {
      ...typeConverters.Position.toFileLocationRequestArgs(file, position),
      key: ch
    }
    try {
      const res = await this.client.execute('formatonkey', args, token)
      if (res.type != 'response') {
        return []
      }
      const { body } = res
      const edits = body
      const result: TextEdit[] = []
      if (!edits) {
        return result
      }
      for (const edit of edits) {
        const textEdit = typeConverters.TextEdit.fromCodeEdit(edit)
        const range = textEdit.range
        // Work around for https://github.com/Microsoft/TypeScript/issues/6700.
        // Check if we have an edit at the beginning of the line which only removes white spaces and leaves
        // an empty line. Drop those edits
        if (
          range.start.character === 0 &&
          range.start.line === range.end.line &&
          textEdit.newText === ''
        ) {
          const lText = doc.getline(range.start.line)
          // If the edit leaves something on the line keep the edit (note that the end character is exclusive).
          // Keep it also if it removes something else than whitespace
          if (lText.trim().length > 0 || lText.length > range.end.character) {
            result.push(textEdit)
          }
        } else {
          result.push(textEdit)
        }
      }
      return result
    } catch {
      // noop
    }
    return []
  }
}
