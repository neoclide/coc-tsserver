/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken, Command, CompletionContext, CompletionItem, InsertTextFormat, MarkupContent, MarkupKind, Position, TextDocument, TextEdit, CompletionList } from 'vscode-languageserver-protocol'
import { commands, workspace } from 'coc.nvim'
import { CompletionItemProvider } from 'coc.nvim/lib/provider'
import Proto from '../protocol'
import * as PConst from '../protocol.const'
import { ITypeScriptServiceClient } from '../typescriptService'
import API from '../utils/api'
import { applyCodeAction } from '../utils/codeAction'
import { convertCompletionEntry, getParameterListParts } from '../utils/completionItem'
import * as Previewer from '../utils/previewer'
import * as typeConverters from '../utils/typeConverters'
import TypingsStatus from '../utils/typingsStatus'
import FileConfigurationManager, { SuggestOptions } from './fileConfigurationManager'

// command center
export interface CommandItem {
  readonly id: string | string[]
  execute(...args: any[]): void | Promise<any>
}

class ApplyCompletionCodeActionCommand implements CommandItem {
  public static readonly ID = '_typescript.applyCompletionCodeAction'
  public readonly id = ApplyCompletionCodeActionCommand.ID
  public constructor(
    private readonly client: ITypeScriptServiceClient
  ) {
  }

  // apply code action on complete
  public async execute(codeActions: Proto.CodeAction[]): Promise<void> {
    if (codeActions.length === 0) {
      return
    }
    if (codeActions.length === 1) {
      await applyCodeAction(this.client, codeActions[0])
      return
    }
    const idx = await workspace.showQuickpick(codeActions.map(o => o.description), 'Select code action to apply')
    if (idx < 0) return
    const action = codeActions[idx]
    await applyCodeAction(this.client, action)
    return
  }
}

export default class TypeScriptCompletionItemProvider implements CompletionItemProvider {

  public static readonly triggerCharacters = ['.', '"', '\'', '/', '@', '<']
  private completeOption: SuggestOptions
  private noSemicolons = false

  constructor(
    private readonly client: ITypeScriptServiceClient,
    private readonly typingsStatus: TypingsStatus,
    private readonly fileConfigurationManager: FileConfigurationManager,
    languageId: string
  ) {

    this.setCompleteOption(languageId)
    commands.register(new ApplyCompletionCodeActionCommand(this.client))
    workspace.onDidChangeConfiguration(_e => {
      this.setCompleteOption(languageId)
    })
  }

  private setCompleteOption(languageId: string): void {
    this.completeOption = this.fileConfigurationManager.getCompleteOptions(languageId)
    this.noSemicolons = this.fileConfigurationManager.removeSemicolons(languageId)
  }

  /**
   * Get completionItems
   *
   * @public
   * @param {TextDocument} document
   * @param {Position} position
   * @param {CancellationToken} token
   * @param {string} triggerCharacter
   * @returns {Promise<CompletionItem[]>}
   */
  public async provideCompletionItems(
    document: TextDocument,
    position: Position,
    token: CancellationToken,
    context: CompletionContext,
  ): Promise<CompletionList | null> {
    if (this.typingsStatus.isAcquiringTypings) {
      workspace.showMessage('Acquiring typings...', 'warning')
      return null
    }
    let { uri } = document
    const file = this.client.toPath(document.uri)
    if (!file) return null
    let preText = document.getText({
      start: { line: position.line, character: 0 },
      end: position
    })
    let { triggerCharacter, option } = context as any

    if (!this.shouldTrigger(triggerCharacter, preText, option)) {
      return null
    }

    const { completeOption } = this
    const doc = workspace.getDocument(uri)

    const args: Proto.CompletionsRequestArgs = {
      ...typeConverters.Position.toFileLocationRequestArgs(file, position),
      includeExternalModuleExports: completeOption.autoImports,
      includeInsertTextCompletions: true,
      triggerCharacter: this.getTsTriggerCharacter(context)
    }

    let msg: ReadonlyArray<Proto.CompletionEntry> | undefined

    let isNewIdentifierLocation = true
    if (this.client.apiVersion.gte(API.v300)) {
      try {
        const response = await this.client.execute('completionInfo', args, token)
        if (response.type !== 'response' || !response.body) {
          return null
        }
        isNewIdentifierLocation = response.body.isNewIdentifierLocation
        msg = response.body.entries
      } catch (e) {
        if (e.message == 'No content available.') {
          return null
        }
        throw e
      }
    } else {
      const response = await this.client.execute('completions', args, token)
      msg = response.body
      if (!msg) return null
    }

    const completionItems: CompletionItem[] = []
    for (const element of msg) {
      if (shouldExcludeCompletionEntry(element, completeOption)) {
        continue
      }
      const item = convertCompletionEntry(
        element,
        uri,
        position,
        completeOption.completeFunctionCalls,
        isNewIdentifierLocation
      )
      completionItems.push(item)
    }
    let startcol: number | null = null
    if (triggerCharacter == '@' && !doc.isWord('@')) {
      startcol = option.col - 1
    }
    let res: any = {
      startcol,
      isIncomplete: false,
      items: completionItems
    }
    return res
  }

  private getTsTriggerCharacter(context: CompletionContext): Proto.CompletionsTriggerCharacter | undefined {
    // Workaround for https://github.com/Microsoft/TypeScript/issues/27321
    if (context.triggerCharacter === '@'
      && this.client.apiVersion.gte(API.v310) && this.client.apiVersion.lt(API.v320)
    ) {
      return undefined
    }

    return context.triggerCharacter as Proto.CompletionsTriggerCharacter
  }

  /**
   * Resolve complete item, could have documentation added
   *
   * @public
   * @param {CompletionItem} item
   * @param {CancellationToken} token
   * @returns {Promise<CompletionItem>}
   */
  public async resolveCompletionItem(
    item: CompletionItem,
    token: CancellationToken
  ): Promise<CompletionItem> {
    if (item == null) return undefined

    let { uri, position, source } = item.data
    const filepath = this.client.toPath(uri)
    if (!filepath) return undefined
    let document = workspace.getDocument(uri)
    if (!document) return undefined
    const args: Proto.CompletionDetailsRequestArgs = {
      ...typeConverters.Position.toFileLocationRequestArgs(
        filepath,
        position
      ),
      entryNames: [
        source
          ? { name: item.label, source }
          : item.label
      ]
    }

    let response: Proto.CompletionDetailsResponse
    try {
      response = await this.client.execute(
        'completionEntryDetails',
        args,
        token
      )
    } catch {
      return item
    }

    const details = response.body
    if (!details || !details.length || !details[0]) {
      return item
    }
    const detail = details[0]
    item.detail = detail.displayParts.length
      ? Previewer.plain(detail.displayParts)
      : undefined

    item.documentation = this.getDocumentation(detail)
    const { command, additionalTextEdits } = this.getCodeActions(detail, filepath)
    if (command) item.command = command
    item.additionalTextEdits = additionalTextEdits
    if (detail && item.insertTextFormat == InsertTextFormat.Snippet) {
      const shouldCompleteFunction = await this.isValidFunctionCompletionContext(filepath, position, token)
      if (shouldCompleteFunction) {
        this.createSnippetOfFunctionCall(item, detail)
      }
    }

    return item
  }

  private getCodeActions(
    detail: Proto.CompletionEntryDetails,
    filepath: string
  ): { command?: Command; additionalTextEdits?: TextEdit[] } {
    if (!detail.codeActions || !detail.codeActions.length) {
      return {}
    }
    // Try to extract out the additionalTextEdits for the current file.
    // Also check if we still have to apply other workspace edits
    const additionalTextEdits: TextEdit[] = []
    let hasReaminingCommandsOrEdits = false
    for (const tsAction of detail.codeActions) {
      if (tsAction.commands) {
        hasReaminingCommandsOrEdits = true
      }
      // Convert all edits in the current file using `additionalTextEdits`
      if (tsAction.changes) {
        for (const change of tsAction.changes) {
          if (change.fileName === filepath) {
            additionalTextEdits.push(
              ...change.textChanges.map(typeConverters.TextEdit.fromCodeEdit)
            )
          } else {
            hasReaminingCommandsOrEdits = true
          }
        }
      }
    }

    let command = null

    if (hasReaminingCommandsOrEdits) {
      // Create command that applies all edits not in the current file.
      command = {
        title: '',
        command: ApplyCompletionCodeActionCommand.ID,
        arguments: [
          detail.codeActions.map((x): Proto.CodeAction => ({
            commands: x.commands,
            description: x.description,
            changes: x.changes.filter(x => x.fileName !== filepath)
          }))
        ]
      }
    }
    if (additionalTextEdits.length && this.noSemicolons) {
      // remove comma
      additionalTextEdits.forEach(o => {
        o.newText = o.newText.replace(/;/g, '')
      })
    }
    return {
      command,
      additionalTextEdits: additionalTextEdits.length
        ? additionalTextEdits
        : undefined
    }
  }

  private shouldTrigger(
    triggerCharacter: string,
    pre: string,
    option: any
  ): boolean {
    if (triggerCharacter === '.') {
      if (pre.match(/[\s\.'"]\.$/)) {
        return false
      }
    } else if (triggerCharacter === '@') {
      // trigger in string
      if (option.synname && /string/i.test(option.synname)) {
        return true
      }
      // make sure we are in something that looks like the start of a jsdoc comment
      if (!pre.match(/^\s*\*[ ]?@/) && !pre.match(/\/\*\*+[ ]?@/)) {
        return false
      }
    } else if (triggerCharacter === '<') {
      return this.client.apiVersion.gte(API.v290)
    }

    return true
  }

  // complete item documentation
  private getDocumentation(detail: Proto.CompletionEntryDetails): MarkupContent | undefined {
    let documentation = ''
    if (detail.source) {
      const importPath = `'${Previewer.plain(detail.source)}'`
      const autoImportLabel = `Auto import from ${importPath}`
      documentation += `${autoImportLabel}\n`
    }
    let parts = [
      Previewer.plain(detail.documentation),
      Previewer.tagsMarkdownPreview(detail.tags)
    ]
    parts = parts.filter(s => s && s.trim() != '')
    documentation += parts.join('\n\n')
    if (documentation.length) {
      return {
        kind: MarkupKind.Markdown,
        value: documentation
      }
    }
    return undefined
  }

  private createSnippetOfFunctionCall(
    item: CompletionItem,
    detail: Proto.CompletionEntryDetails
  ): void {
    let { displayParts } = detail
    let snippet = (item.insertText || item.label) + '(' // tslint:disable-line
    const parameterListParts = getParameterListParts(displayParts)
    let { parts, hasOptionalParameters } = parameterListParts
    let idx = 1
    for (let part of parts) {
      snippet += '${' + idx + ':' + part.text + '}' // tslint:disable-line
      if (idx == parts.length) {
        if (hasOptionalParameters) snippet += '${' + (idx + 1) + '}' // tslint:disable-line
      } else {
        snippet += ', '
      }
      idx = idx + 1
    }
    snippet += ')$0'
    // tslint:disable-next-line:deprecation
    item.insertText = snippet
  }

  private async isValidFunctionCompletionContext(
    filepath: string,
    position: Position,
    token: CancellationToken
  ): Promise<boolean> {
    // Workaround for https://github.com/Microsoft/TypeScript/issues/12677
    // Don't complete function calls inside of destructive assigments or imports
    try {
      const args: Proto.FileLocationRequestArgs = typeConverters.Position.toFileLocationRequestArgs(filepath, position)
      const response = await this.client.execute('quickinfo', args, token)
      if (response.type !== 'response') {
        return true
      }

      const { body } = response
      switch (body && body.kind) {
        case 'var':
        case 'let':
        case 'const':
        case 'alias':
          return false
        default:
          return true
      }
    } catch (e) {
      return true
    }
  }
}

function shouldExcludeCompletionEntry(
  element: Proto.CompletionEntry,
  completionConfiguration: SuggestOptions
): boolean {
  return (
    (!completionConfiguration.names && element.kind === PConst.Kind.warning)
    || (!completionConfiguration.paths &&
      (element.kind === PConst.Kind.directory || element.kind === PConst.Kind.script || element.kind === PConst.Kind.externalModuleName))
    || (!completionConfiguration.autoImports && element.hasAction)
  )
}
