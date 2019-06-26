/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { TextDocument, CancellationToken } from 'vscode-languageserver-protocol'
import { WorkspaceConfiguration, workspace } from 'coc.nvim'
import Proto from '../protocol'
import { ITypeScriptServiceClient } from '../typescriptService'
import API from '../utils/api'
import * as languageIds from '../utils/languageModeIds'

function objAreEqual<T>(a: T, b: T): boolean {
  let keys = Object.keys(a)
  for (let i = 0; i < keys.length; i++) { // tslint:disable-line
    let key = keys[i]
    if ((a as any)[key] !== (b as any)[key]) {
      return false
    }
  }
  return true
}

interface FormatOptions {
  tabSize: number
  insertSpaces: boolean
}

interface FileConfiguration {
  formatOptions: Proto.FormatCodeSettings
  preferences: Proto.UserPreferences
}

export interface SuggestOptions {
  readonly enabled: boolean
  readonly names: boolean
  readonly paths: boolean
  readonly completeFunctionCalls: boolean
  readonly autoImports: boolean
}

export default class FileConfigurationManager {
  private cachedOption = null
  private requesting = false

  public constructor(private readonly client: ITypeScriptServiceClient) {
  }

  public async ensureConfigurationOptions(languageId: string, insertSpaces: boolean, tabSize: number): Promise<void> {
    let { requesting } = this
    let options: FormatOptions = {
      tabSize,
      insertSpaces
    }
    if (requesting || (this.cachedOption && objAreEqual(this.cachedOption, options))) return
    const currentOptions = this.getFileOptions(options, languageId)
    this.requesting = true
    const args = {
      hostInfo: 'nvim-coc',
      ...currentOptions
    } as Proto.ConfigureRequestArguments
    await this.client.execute('configure', args, CancellationToken.None)
    this.cachedOption = options
    this.requesting = false
  }

  public async ensureConfigurationForDocument(document: TextDocument): Promise<void> {
    let opts = await workspace.getFormatOptions(document.uri)
    if (!this.client.bufferSyncSupport.has(document.uri)) return
    return this.ensureConfigurationOptions(document.languageId, opts.insertSpaces, opts.tabSize)
  }

  public reset(): void {
    this.cachedOption = null
  }

  public getLanguageConfiguration(languageId: string): WorkspaceConfiguration {
    return workspace.getConfiguration(languageId)
  }

  public isTypeScriptDocument(languageId: string): boolean {
    return languageId === languageIds.typescript || languageId === languageIds.typescriptreact ||
      languageId === languageIds.typescripttsx || languageId === languageIds.typescriptjsx
  }

  public enableJavascript(): boolean {
    const config = workspace.getConfiguration('tsserver')
    return !!config.get<boolean>('enableJavascript')
  }

  private getFileOptions(options: FormatOptions, languageId: string): FileConfiguration {
    const lang = this.isTypeScriptDocument(languageId) ? 'typescript' : 'javascript'
    return {
      formatOptions: this.getFormatOptions(options, lang),
      preferences: this.getPreferences(lang)
    }
  }

  private getFormatOptions(options: FormatOptions, language: string): Proto.FormatCodeSettings {
    const config = workspace.getConfiguration(`${language}.format`)

    return {
      tabSize: options.tabSize,
      indentSize: options.tabSize,
      convertTabsToSpaces: options.insertSpaces,
      // We can use \n here since the editor normalizes later on to its line endings.
      newLineCharacter: '\n',
      insertSpaceAfterCommaDelimiter: config.get<boolean>('insertSpaceAfterCommaDelimiter'),
      insertSpaceAfterConstructor: config.get<boolean>('insertSpaceAfterConstructor'),
      insertSpaceAfterSemicolonInForStatements: config.get<boolean>('insertSpaceAfterSemicolonInForStatements'),
      insertSpaceBeforeAndAfterBinaryOperators: config.get<boolean>('insertSpaceBeforeAndAfterBinaryOperators'),
      insertSpaceAfterKeywordsInControlFlowStatements: config.get<boolean>('insertSpaceAfterKeywordsInControlFlowStatements'),
      insertSpaceAfterFunctionKeywordForAnonymousFunctions: config.get<boolean>('insertSpaceAfterFunctionKeywordForAnonymousFunctions'),
      insertSpaceBeforeFunctionParenthesis: config.get<boolean>('insertSpaceBeforeFunctionParenthesis'),
      insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: config.get<boolean>('insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis'),
      insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: config.get<boolean>('insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets'),
      insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: config.get<boolean>('insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces'),
      insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: config.get<boolean>('insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces'),
      insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces: config.get<boolean>('insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces'),
      insertSpaceAfterTypeAssertion: config.get<boolean>('insertSpaceAfterTypeAssertion'),
      placeOpenBraceOnNewLineForFunctions: config.get<boolean>('placeOpenBraceOnNewLineForFunctions'),
      placeOpenBraceOnNewLineForControlBlocks: config.get<boolean>('placeOpenBraceOnNewLineForControlBlocks')
    }
  }

  public getCompleteOptions(languageId: string): SuggestOptions {
    const lang = this.isTypeScriptDocument(languageId) ? 'typescript' : 'javascript'
    const config = workspace.getConfiguration(`${lang}.suggest`)
    return {
      enabled: config.get<boolean>('enabled', true),
      names: config.get<boolean>('names', true),
      paths: config.get<boolean>('paths', true),
      completeFunctionCalls: config.get<boolean>('completeFunctionCalls', true),
      autoImports: config.get<boolean>('autoImports', true)
    }
  }

  public removeSemicolons(languageId: string): boolean {
    const lang = this.isTypeScriptDocument(languageId) ? 'typescript' : 'javascript'
    const config = workspace.getConfiguration(`${lang}.preferences`)
    return config.get<boolean>('noSemicolons', false)
  }

  public getPreferences(language: string): Proto.UserPreferences {
    if (!this.client.apiVersion.gte(API.v290)) {
      return {}
    }
    const config = workspace.getConfiguration(`${language}`)
    const defaultQuote = this.client.apiVersion.gte(API.v333) ? 'auto' : undefined
    return {
      disableSuggestions: !config.get<boolean>('suggest.enabled', true),
      importModuleSpecifierPreference: getImportModuleSpecifier(config) as any,
      quotePreference: config.get<'single' | 'double' | 'auto'>('preferences.quoteStyle', defaultQuote),
      allowRenameOfImportPath: true,
      allowTextChangesInNewFiles: true,
    }
  }
}

type ModuleImportType = 'relative' | 'non-relative' | 'auto'

function getImportModuleSpecifier(config): ModuleImportType {
  let val = config.get('preferences.importModuleSpecifier')
  switch (val) {
    case 'relative':
      return 'relative'
    case 'non-relative':
      return 'non-relative'
    default:
      return 'auto'
  }
}
