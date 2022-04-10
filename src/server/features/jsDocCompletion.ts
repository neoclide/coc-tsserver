/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CompletionItem, CompletionItemKind, CompletionItemProvider, InsertTextFormat, Position, Range, SnippetString, TextDocument, workspace } from 'coc.nvim'
import { ITypeScriptServiceClient } from '../typescriptService'
import { LanguageDescription } from '../utils/languageDescription'
import * as typeConverters from '../utils/typeConverters'
import FileConfigurationManager from './fileConfigurationManager'

const defaultJsDoc = new SnippetString(`/**\n * $0\n */`)

function createCompleteItem(document: TextDocument, position: Position): CompletionItem {
  const line = document.lineAt(position.line).text
  const prefix = line.slice(0, position.character).match(/\/\**\s*$/)
  const suffix = line.slice(position.character).match(/^\s*\**\//)
  const start = Position.create(position.line, prefix ? position.character - prefix[0].length : position.character)
  const range = Range.create(start, Position.create(start.line, start.character + (suffix ? suffix[0].length : 0)))
  let insert = `/** */`
  return {
    label: insert,
    kind: CompletionItemKind.Text,
    insertTextFormat: InsertTextFormat.Snippet,
    detail: 'JSDoc comment',
    sortText: `\0`,
    textEdit: {
      newText: insert,
      range
    }
  }
}

export class JsDocCompletionProvider implements CompletionItemProvider {
  constructor(
    private readonly client: ITypeScriptServiceClient,
    private readonly language: LanguageDescription,
    private readonly fileConfigurationManager: FileConfigurationManager,
  ) {}

  public async provideCompletionItems(
    document: TextDocument,
    position: Position,
    token: CancellationToken
  ): Promise<CompletionItem[] | undefined> {
    if (!workspace.getConfiguration(this.language.id, document.uri).get('suggest.completeJSDocs')) {
      return undefined
    }

    const file = this.client.toOpenedFilePath(document.uri)
    if (!file) {
      return undefined
    }

    if (!this.isPotentiallyValidDocCompletionPosition(document, position)) {
      return undefined
    }

    const response = await this.client.interruptGetErr(async () => {
      await this.fileConfigurationManager.ensureConfigurationForDocument(document, token)
      const args = typeConverters.Position.toFileLocationRequestArgs(file, position)
      return this.client.execute('docCommentTemplate', args, token)
    })
    if (response.type !== 'response' || !response.body) {
      return undefined
    }

    const item = createCompleteItem(document, position)

    // Workaround for #43619
    // docCommentTemplate previously returned undefined for empty jsdoc templates.
    // TS 2.7 now returns a single line doc comment, which breaks indentation.
    if (response.body.newText === '/** */') {
      item.textEdit.newText = defaultJsDoc.value
    } else {
      item.textEdit.newText = templateToSnippet(response.body.newText).value
    }

    return [item]
  }

  private isPotentiallyValidDocCompletionPosition(
    document: TextDocument,
    position: Position
  ): boolean {
    // Only show the JSdoc completion when the everything before the cursor is whitespace
    // or could be the opening of a comment
    const line = document.lineAt(position.line).text
    const prefix = line.slice(0, position.character)
    if (!/^\s*$|\/\*\s*$|^\s*\/\*+\s*$/.test(prefix)) {
      return false
    }

    // And everything after is possibly a closing comment or more whitespace
    const suffix = line.slice(position.character)
    return /^\s*(\*+\/)?\s*$/.test(suffix)
  }
}

export function templateToSnippet(template: string): SnippetString {
  // TODO: use append placeholder
  let snippetIndex = 1
  template = template.replace(/\*\s$/gm, '*')
  template = template.replace(/\$/g, '\\$')
  template = template.replace(/^[ \t]*(?=(\/|[ ]\*))/gm, '')
  template = template.replace(/^(\/\*\*\s*\*[ ]*)$/m, (x) => x + `\$0`)
  template = template.replace(/\* @param([ ]\{\S+\})?\s+(\S+)[ \t]*$/gm, (_param, type, post) => {
    let out = '* @param '
    if (type === ' {any}' || type === ' {*}') {
      out += `{\$\{${snippetIndex++}:*\}} `
    } else if (type) {
      out += type + ' '
    }
    out += post + ` \${${snippetIndex++}}`
    return out
  })

  template = template.replace(/\* @returns[ \t]*$/gm, `* @returns \${${snippetIndex++}}`)

  return new SnippetString(template)
}
