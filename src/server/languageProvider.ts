/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CodeActionKind, Diagnostic, DiagnosticSeverity, Disposable, disposeAll, DocumentFilter, languages, TextDocument, Uri, workspace } from 'coc.nvim'
import path from 'path'
import * as fileSchemes from '../utils/fileSchemes'
import CallHierarchyProvider from './features/callHierarchy'
import CompletionItemProvider from './features/completionItemProvider'
import DefinitionProvider from './features/definitionProvider'
import { DiagnosticKind } from './features/diagnostics'
import DirectiveCommentCompletionProvider from './features/directiveCommentCompletions'
import DocumentHighlight from './features/documentHighlight'
import DocumentSymbolProvider from './features/documentSymbol'
import FileConfigurationManager from './features/fileConfigurationManager'
import { TypeScriptAutoFixProvider } from './features/fixAll'
import Folding from './features/folding'
import FormattingProvider from './features/formatting'
import HoverProvider from './features/hover'
import ImplementationsCodeLensProvider from './features/implementationsCodeLens'
import ImportfixProvider from './features/importFix'
import TypeScriptInlayHintsProvider from './features/inlayHints'
import { JsDocCompletionProvider } from './features/jsDocCompletion'
import InstallModuleProvider from './features/moduleInstall'
import QuickfixProvider from './features/quickfix'
import RefactorProvider from './features/refactor'
import ReferenceProvider from './features/references'
import ReferencesCodeLensProvider from './features/referencesCodeLens'
import RenameProvider from './features/rename'
import { TypeScriptDocumentSemanticTokensProvider } from './features/semanticTokens'
import SignatureHelpProvider from './features/signatureHelp'
import SmartSelection from './features/smartSelect'
import TagClosing from './features/tagClosing'
import { OrganizeImportsCodeActionProvider } from './organizeImports'
import { CachedResponse } from './tsServer/cachedResponse'
import { ClientCapability } from './typescriptService'
import TypeScriptServiceClient from './typescriptServiceClient'
import API from './utils/api'
import { LanguageDescription } from './utils/languageDescription'
import TypingsStatus from './utils/typingsStatus'


const validateSetting = 'validate.enable'
const suggestionSetting = 'suggestionActions.enabled'

export interface DocumentSelector {
  /**
   * Selector for files which only require a basic syntax server.
   */
  readonly syntax: DocumentFilter[]

  /**
   * Selector for files which require semantic server support.
   */
  readonly semantic: DocumentFilter[]
}

export default class LanguageProvider {
  private readonly disposables: Disposable[] = []

  constructor(
    public client: TypeScriptServiceClient,
    private readonly fileConfigurationManager: FileConfigurationManager,
    private description: LanguageDescription,
    typingsStatus: TypingsStatus
  ) {
    workspace.onDidChangeConfiguration(this.configurationChanged, this, this.disposables)
    this.configurationChanged()
    client.onReady(() => {
      this.registerProviders(client, typingsStatus)
    })
  }

  private get documentSelector(): DocumentSelector {
    const semantic: DocumentFilter[] = []
    const syntax: DocumentFilter[] = []
    for (const language of this.description.languageIds) {
      syntax.push({ language })
      for (const scheme of fileSchemes.semanticSupportedSchemes) {
        semantic.push({ language, scheme })
      }
    }
    return { semantic, syntax }
  }

  private configurationChanged(): void {
    const config = workspace.getConfiguration(this.id, null)
    // this.client.diagnosticsManager.setEnableSuggestions(this.id, config.get(suggestionSetting, true))
    this.updateValidate(config.get(validateSetting, true))
    this.updateSuggestionDiagnostics(config.get(suggestionSetting, true))
  }

  private get _diagnosticLanguage() {
    return this.description.diagnosticLanguage
  }

  private updateValidate(value: boolean) {
    this.client.diagnosticsManager.setValidate(this._diagnosticLanguage, value)
  }

  private updateSuggestionDiagnostics(value: boolean) {
    this.client.diagnosticsManager.setEnableSuggestions(this._diagnosticLanguage, value)
  }

  public dispose(): void {
    disposeAll(this.disposables)
  }

  private _register(disposable: Disposable): void {
    this.disposables.push(disposable)
  }

  private registerProviders(
    client: TypeScriptServiceClient,
    typingsStatus: TypingsStatus
  ): void {
    // let languageIds = this.description.languageIds
    let clientId = `tsc-${this.description.id}`
    const hasSemantic = this.client.capabilities.has(ClientCapability.Semantic)
    const { documentSelector } = this
    this._register(
      languages.registerCompletionItemProvider(clientId, 'TSC', documentSelector.syntax,
        new CompletionItemProvider(client, typingsStatus, this.fileConfigurationManager, this.description.id),
        CompletionItemProvider.triggerCharacters
      )
    )
    this._register(
      languages.registerCompletionItemProvider(`tsc-${this.description.id}-jsdoc`, 'TSC', documentSelector.syntax,
        new JsDocCompletionProvider(client, this.description, this.fileConfigurationManager),
        ['*', ' ']
      )
    )
    if (this.client.apiVersion.gte(API.v230)) {
      this._register(languages.registerCompletionItemProvider(
        `${this.description.id}-directive`,
        'TSC', documentSelector.syntax, new DirectiveCommentCompletionProvider(client), ['@']
      ))
    }

    let definitionProvider = new DefinitionProvider(client)
    this._register(languages.registerDefinitionProvider(documentSelector.syntax, definitionProvider))
    this._register(languages.registerTypeDefinitionProvider(documentSelector.syntax, definitionProvider))
    if (hasSemantic) {
      this._register(languages.registerImplementationProvider(documentSelector.semantic, definitionProvider))
    }
    this._register(languages.registerReferencesProvider(documentSelector.syntax, new ReferenceProvider(client)))
    this._register(languages.registerHoverProvider(documentSelector.syntax, new HoverProvider(client)))
    this._register(languages.registerDocumentHighlightProvider(documentSelector.syntax, new DocumentHighlight(this.client)))
    this._register(languages.registerSignatureHelpProvider(documentSelector.syntax, new SignatureHelpProvider(client), ['(', ',', '<', ')']))
    this._register(languages.registerDocumentSymbolProvider(documentSelector.syntax, new DocumentSymbolProvider(client)))
    if (hasSemantic) {
      this._register(languages.registerRenameProvider(documentSelector.semantic, new RenameProvider(client, this.fileConfigurationManager)))
    }
    let formatProvider = new FormattingProvider(client, this.fileConfigurationManager)
    this._register(languages.registerDocumentFormatProvider(documentSelector.syntax, formatProvider))
    this._register(languages.registerDocumentRangeFormatProvider(documentSelector.syntax, formatProvider))
    this._register(languages.registerOnTypeFormattingEditProvider(documentSelector.syntax, formatProvider, [';', '}', '\n', String.fromCharCode(27)]))
    this._register(languages.registerCodeActionProvider(documentSelector.syntax, new InstallModuleProvider(client), 'tsserver'))
    if (this.client.apiVersion.gte(API.v380) && typeof languages['registerCallHierarchyProvider'] === 'function' && hasSemantic) {
      this._register(languages.registerCallHierarchyProvider(documentSelector.semantic, new CallHierarchyProvider(client)))
    }
    if (this.client.apiVersion.gte(API.v370) && hasSemantic) {
      const provider = new TypeScriptDocumentSemanticTokensProvider(client)
      // if (typeof languages['registerDocumentSemanticTokensProvider'] === 'function') {
      //   this._register(languages.registerDocumentSemanticTokensProvider(documentSelector.syntax, provider, provider.getLegend()))
      // }
      if (typeof languages['registerDocumentRangeSemanticTokensProvider'] === 'function') {
        this._register(languages.registerDocumentRangeSemanticTokensProvider(documentSelector.semantic, provider, provider.getLegend()))
      }
    }

    let { fileConfigurationManager } = this
    let conf = fileConfigurationManager.getLanguageConfiguration(this.id)
    if (this.client.apiVersion.gte(API.v280)) {
      this._register(languages.registerFoldingRangeProvider(documentSelector.syntax, new Folding(this.client)))
      if (hasSemantic) {
        let provider = new OrganizeImportsCodeActionProvider(this.id, this.client, this.fileConfigurationManager)
        this._register(
          languages.registerCodeActionProvider(documentSelector.semantic, provider, 'tsserver', provider.metadata.providedCodeActionKinds)
        )
        this.disposables.push(provider)
      }
    }
    if (this.client.apiVersion.gte(API.v240) && hasSemantic) {
      this._register(
        languages.registerCodeActionProvider(
          documentSelector.semantic,
          new RefactorProvider(client, this.fileConfigurationManager),
          'tsserver',
          [CodeActionKind.Refactor]))
    }

    if (this.client.apiVersion.gte(API.v300) && hasSemantic) {
      let provider = new TypeScriptAutoFixProvider(client, this.fileConfigurationManager, client.diagnosticsManager)
      this._register(
        languages.registerCodeActionProvider(
          documentSelector.semantic, provider, 'tsserver', provider.metadata.providedCodeActionKinds
        )
      )
    }
    if (hasSemantic) {
      this._register(
        languages.registerCodeActionProvider(
          documentSelector.semantic, new QuickfixProvider(client, this.fileConfigurationManager, client.diagnosticsManager),
          'tsserver', [CodeActionKind.QuickFix]))
    }
    this._register(
      languages.registerCodeActionProvider(
        documentSelector.syntax, new ImportfixProvider(this.client.bufferSyncSupport),
        'tsserver', [CodeActionKind.QuickFix]))

    if (hasSemantic) {
      let cachedResponse = new CachedResponse()
      if (this.client.apiVersion.gte(API.v206) && conf.get<boolean>('referencesCodeLens.enabled')) {
        this._register(languages.registerCodeLensProvider(documentSelector.semantic, new ReferencesCodeLensProvider(client, cachedResponse, this.description.id)))
      }
      if (this.client.apiVersion.gte(API.v220) && conf.get<boolean>('implementationsCodeLens.enabled')) {
        this._register(languages.registerCodeLensProvider(documentSelector.semantic, new ImplementationsCodeLensProvider(client, cachedResponse, this.description.id)))
      }
    }
    if (this.client.apiVersion.gte(API.v350)) {
      this._register(languages.registerSelectionRangeProvider(documentSelector.syntax, new SmartSelection(this.client)))
    }
    if (this.client.apiVersion.gte(API.v300)) {
      this._register(new TagClosing(this.client, this.description.id))
    }
    if (this.client.apiVersion.gte(API.v440) && hasSemantic) {
      if (typeof languages.registerInlayHintsProvider === 'function') {
        let provider = new TypeScriptInlayHintsProvider(this.description, this.client, this.fileConfigurationManager)
        this._register(provider)
        this._register(languages.registerInlayHintsProvider(documentSelector.semantic, provider))
      } else {
        this.client.logger.error(`languages.registerInlayHintsProvider is not a function, inlay hints won't work`)
      }
    }
  }

  public handles(resource: string, doc: TextDocument): boolean {
    if (doc && this.description.languageIds.includes(doc.languageId)) {
      return true
    }
    return this.handlesConfigFile(Uri.parse(resource))
  }

  private handlesConfigFile(uri: Uri): boolean {
    const base = path.basename(uri.fsPath)
    return !!base && (!!this.description.configFilePattern && this.description.configFilePattern.test(base))
  }

  public handlesUri(resource: Uri): boolean {
    const ext = path.extname(resource.path).slice(1).toLowerCase()
    return this.description.standardFileExtensions.includes(ext) || this.handlesConfigFile(resource)
  }

  private get id(): string { // tslint:disable-line
    return this.description.id
  }

  public get diagnosticSource(): string {
    return this.description.diagnosticSource
  }

  public reInitialize(): void {
    this.client.diagnosticsManager.reInitialize()
  }

  public triggerAllDiagnostics(): void {
    this.client.bufferSyncSupport.requestAllDiagnostics()
  }

  public diagnosticsReceived(
    diagnosticsKind: DiagnosticKind,
    resource: string,
    diagnostics: (Diagnostic & { reportUnnecessary: any, reportDeprecated: any })[]
  ): void {
    const config = workspace.getConfiguration(this.id, resource)
    const reportUnnecessary = config.get<boolean>('showUnused', true)
    const reportDeprecated = config.get<boolean>('showDeprecated', true)
    this.client.diagnosticsManager.updateDiagnostics(resource, this._diagnosticLanguage, diagnosticsKind, diagnostics.filter(diag => {
      if (!reportUnnecessary) {
        if (diag.reportUnnecessary && diag.severity === DiagnosticSeverity.Information) {
          return false
        }
      }
      if (!reportDeprecated) {
        if (diag.reportDeprecated && diag.severity === DiagnosticSeverity.Hint) {
          return false
        }
      }
      return true
    }))
  }
}
