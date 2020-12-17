import { commands, CompletionItemProvider, TextDocument, window, workspace } from 'coc.nvim'
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken, Command, CompletionContext, CompletionItem, CompletionList, InsertTextFormat, MarkupContent, MarkupKind, Position, Range, TextEdit } from 'vscode-languageserver-protocol'
import Proto from '../protocol'
import * as PConst from '../protocol.const'
import { ITypeScriptServiceClient, ServerResponse } from '../typescriptService'
import API from '../utils/api'
import { applyCodeAction } from '../utils/codeAction'
import { convertCompletionEntry, DotAccessorContext, getParameterListParts } from '../utils/completionItem'
import * as Previewer from '../utils/previewer'
import SnippetString from '../utils/SnippetString'
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
    const idx = await window.showQuickpick(codeActions.map(o => o.description), 'Select code action to apply')
    if (idx < 0) return
    const action = codeActions[idx]
    await applyCodeAction(this.client, action)
    return
  }
}

export default class TypeScriptCompletionItemProvider implements CompletionItemProvider {

  public static readonly triggerCharacters = ['.', '"', '\'', '`', '/', '@', '<', '#']
  private completeOption: SuggestOptions

  constructor(
    private readonly client: ITypeScriptServiceClient,
    private readonly typingsStatus: TypingsStatus,
    private readonly fileConfigurationManager: FileConfigurationManager,
    languageId: string
  ) {

    this.setCompleteOption(languageId)
    commands.registerCommand(ApplyCompletionCodeActionCommand.ID, async (codeActions) => {
      let cmd = new ApplyCompletionCodeActionCommand(this.client)
      await cmd.execute(codeActions)
    })
    workspace.onDidChangeConfiguration(_e => {
      this.setCompleteOption(languageId)
    })
  }

  private setCompleteOption(languageId: string): void {
    this.completeOption = this.fileConfigurationManager.getCompleteOptions(languageId)
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
      return Promise.resolve({
        isIncomplete: true,
        items: [{
          label: 'Acquiring typings...',
          detail: 'Acquiring typings definitions for IntelliSense.'
        }]
      })
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

    await this.client.interruptGetErr(() => this.fileConfigurationManager.ensureConfigurationForDocument(document, token))
    const { completeOption } = this
    const args: Proto.CompletionsRequestArgs & { includeAutomaticOptionalChainCompletions?: boolean } = {
      ...typeConverters.Position.toFileLocationRequestArgs(file, position),
      includeExternalModuleExports: completeOption.autoImports,
      includeInsertTextCompletions: true,
      triggerCharacter: this.getTsTriggerCharacter(context),
      includeAutomaticOptionalChainCompletions: completeOption.includeAutomaticOptionalChainCompletions
    }

    let entries: ReadonlyArray<Proto.CompletionEntry> | undefined

    let dotAccessorContext: DotAccessorContext | undefined
    let isNewIdentifierLocation = true
    let isMemberCompletion = false
    let isIncomplete = false
    const isInValidCommitCharacterContext = this.isInValidCommitCharacterContext(document, position)

    if (this.client.apiVersion.gte(API.v300)) {
      try {
        const response = await this.client.interruptGetErr(() => this.client.execute('completionInfo', args, token))
        if (response.type !== 'response' || !response.body) {
          return null
        }
        isNewIdentifierLocation = response.body.isNewIdentifierLocation
        isMemberCompletion = response.body.isMemberCompletion
        if (isMemberCompletion) {
          const dotMatch = preText.slice(0, position.character).match(/\??\.\s*$/) || undefined
          if (dotMatch) {
            const range = Range.create({
              line: position.line,
              character: position.character - dotMatch.length
            }, position)
            const text = document.getText(range)
            dotAccessorContext = { range, text }
          }
        }
        isIncomplete = (response as any).metadata && (response as any).metadata.isIncomplete
        entries = response.body.entries
      } catch (e) {
        if (e.message == 'No content available.') {
          return null
        }
        throw e
      }
    } else {
      const response = await this.client.interruptGetErr(() => this.client.execute('completions', args, token))
      if (response.type !== 'response' || !response.body) {
        return null
      }
      entries = response.body
    }

    const completionItems: CompletionItem[] = []
    for (const element of entries) {
      if (shouldExcludeCompletionEntry(element, completeOption)) {
        continue
      }
      const item = convertCompletionEntry(
        element,
        uri,
        position,
        {
          isNewIdentifierLocation,
          isMemberCompletion,
          enableCallCompletions: completeOption.completeFunctionCalls,
          isInValidCommitCharacterContext,
          dotAccessorContext,
        }
      )
      completionItems.push(item)
    }
    return { isIncomplete, items: completionItems }
  }

  private getTsTriggerCharacter(context: CompletionContext): Proto.CompletionsTriggerCharacter | undefined {
    // return context.triggerCharacter as Proto.CompletionsTriggerCharacter
    switch (context.triggerCharacter) {
      case '@': // Workaround for https://github.com/Microsoft/TypeScript/issues/27321
        return this.client.apiVersion.gte(API.v310) && this.client.apiVersion.lt(API.v320) ? undefined : '@'

      case '#': // Workaround for https://github.com/microsoft/TypeScript/issues/36367
        return this.client.apiVersion.lt(API.v381) ? undefined : '#'

      case '.':
      case '"':
      case '\'':
      case '`':
      case '/':
      case '<':
        return context.triggerCharacter
    }
    return undefined
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

    let { uri, position, source, name } = item.data
    const filepath = this.client.toPath(uri)
    if (!filepath) return undefined
    let document = workspace.getDocument(uri)
    if (!document) return undefined
    const args: Proto.CompletionDetailsRequestArgs = {
      ...typeConverters.Position.toFileLocationRequestArgs(
        filepath,
        position
      ),
      entryNames: [source ? { name, source } : name]
    }

    let response: ServerResponse.Response<Proto.CompletionDetailsResponse>
    try {
      response = await this.client.interruptGetErr(() => this.client.execute('completionEntryDetails', args, token))
    } catch {
      return item
    }
    if (response.type !== 'response' || !response.body || !response.body.length) {
      return item
    }

    const details = response.body
    if (!details || !details.length || !details[0]) {
      return item
    }
    const detail = details[0]
    if (!item.detail && detail.displayParts.length) {
      item.detail = Previewer.plain(detail.displayParts)
    }
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
    let hasRemainingCommandsOrEdits = false
    for (const tsAction of detail.codeActions) {
      if (tsAction.commands) {
        hasRemainingCommandsOrEdits = true
      }
      // Convert all edits in the current file using `additionalTextEdits`
      if (tsAction.changes) {
        for (const change of tsAction.changes) {
          if (change.fileName === filepath) {
            additionalTextEdits.push(
              ...change.textChanges.map(typeConverters.TextEdit.fromCodeEdit)
            )
          } else {
            hasRemainingCommandsOrEdits = true
          }
        }
      }
    }

    let command = null

    if (hasRemainingCommandsOrEdits) {
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
    if (triggerCharacter && this.client.apiVersion.lt(API.v290)) {
      if (triggerCharacter === '@') {
        // trigger in string
        if (option.synname && /string/i.test(option.synname)) {
          return true
        }
        // make sure we are in something that looks like the start of a jsdoc comment
        if (!pre.match(/^\s*\*[ ]?@/) && !pre.match(/\/\*\*+[ ]?@/)) {
          return false
        }
      } else if (triggerCharacter === '<') {
        return false
      }
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
    const parameterListParts = getParameterListParts(displayParts)
    const snippet = new SnippetString()
    snippet.appendText(`${item.insertText || item.label}(`)
    appendJoinedPlaceholders(snippet, parameterListParts.parts, ', ')
    if (parameterListParts.hasOptionalParameters) {
      snippet.appendTabstop()
    }
    snippet.appendText(')')
    snippet.appendTabstop(0)
    item.insertText = snippet.value
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

  private isInValidCommitCharacterContext(
    document: TextDocument,
    position: Position
  ): boolean {
    if (this.client.apiVersion.lt(API.v320)) {
      // Workaround for https://github.com/Microsoft/TypeScript/issues/27742
      // Only enable dot completions when previous character not a dot preceded by whitespace.
      // Prevents incorrectly completing while typing spread operators.
      if (position.character > 1) {
        const preText = document.getText(Range.create(
          position.line, 0,
          position.line, position.character))
        return preText.match(/(\s|^)\.$/ig) === null
      }
    }
    return true
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

function appendJoinedPlaceholders(
  snippet: SnippetString,
  parts: ReadonlyArray<Proto.SymbolDisplayPart>,
  joiner: string
): void {
  for (let i = 0; i < parts.length; ++i) {
    const paramterPart = parts[i]
    snippet.appendPlaceholder(paramterPart.text)
    if (i !== parts.length - 1) {
      snippet.appendText(joiner)
    }
  }
}
