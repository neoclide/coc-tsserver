/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { disposeAll, languages, Uri, workspace } from 'coc.nvim'
import path from 'path'
import { CodeActionKind, Diagnostic, DiagnosticSeverity, Disposable, TextDocument } from 'vscode-languageserver-protocol'
import { CachedNavTreeResponse } from './features/baseCodeLensProvider'
import CompletionItemProvider from './features/completionItemProvider'
import DefinitionProvider from './features/definitionProvider'
import { DiagnosticKind } from './features/diagnostics'
import DirectiveCommentCompletionProvider from './features/directiveCommentCompletions'
import DocumentHighlight from './features/documentHighlight'
import DocumentSymbolProvider from './features/documentSymbol'
import FileConfigurationManager from './features/fileConfigurationManager'
import Folding from './features/folding'
import FormattingProvider from './features/formatting'
import HoverProvider from './features/hover'
import ImplementationsCodeLensProvider from './features/implementationsCodeLens'
import ImportfixProvider from './features/importFix'
import InstallModuleProvider from './features/moduleInstall'
// import TagCompletionProvider from './features/tagCompletion'
import QuickfixProvider from './features/quickfix'
import RefactorProvider from './features/refactor'
import ReferenceProvider from './features/references'
import ReferencesCodeLensProvider from './features/referencesCodeLens'
import RenameProvider from './features/rename'
import SignatureHelpProvider from './features/signatureHelp'
import SmartSelection from './features/smartSelect'
import UpdateImportsOnFileRenameHandler from './features/updatePathOnRename'
import { OrganizeImportsCodeActionProvider } from './organizeImports'
import TypeScriptServiceClient from './typescriptServiceClient'
import API from './utils/api'
import { LanguageDescription } from './utils/languageDescription'
import TypingsStatus from './utils/typingsStatus'

const suggestionSetting = 'suggestionActions.enabled'

export default class LanguageProvider {
  private readonly disposables: Disposable[] = []

  constructor(
    public client: TypeScriptServiceClient,
    private readonly fileConfigurationManager: FileConfigurationManager,
    private description: LanguageDescription,
    private typingsStatus: TypingsStatus
  ) {
    workspace.onDidChangeConfiguration(this.configurationChanged, this, this.disposables)
    this.configurationChanged()

    let initialized = false
    client.onTsServerStarted(async () => { // tslint:disable-line
      if (!initialized) {
        initialized = true
        this.registerProviders(client, typingsStatus)
      }
    })
  }

  private configurationChanged(): void {
    const config = workspace.getConfiguration(this.id, null)
    this.client.diagnosticsManager.setEnableSuggestions(this.id, config.get(suggestionSetting, true))
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
    let languageIds = this.description.modeIds
    let clientId = `tsserver-${this.description.id}`
    this._register(
      languages.registerCompletionItemProvider(clientId, 'TSC', languageIds,
        new CompletionItemProvider(client, typingsStatus, this.fileConfigurationManager, this.description.id),
        CompletionItemProvider.triggerCharacters
      )
    )
    if (this.client.apiVersion.gte(API.v230)) {
      this._register(languages.registerCompletionItemProvider(
        `${this.description.id}-directive`,
        'TSC', languageIds, new DirectiveCommentCompletionProvider(client,), ['@']
      ))
    }

    let definitionProvider = new DefinitionProvider(client)
    this._register(languages.registerDefinitionProvider(languageIds, definitionProvider))
    this._register(languages.registerTypeDefinitionProvider(languageIds, definitionProvider))
    this._register(languages.registerImplementationProvider(languageIds, definitionProvider))
    this._register(languages.registerReferencesProvider(languageIds, new ReferenceProvider(client)))
    this._register(languages.registerHoverProvider(languageIds, new HoverProvider(client)))
    this._register(languages.registerDocumentHighlightProvider(languageIds, new DocumentHighlight(this.client)))
    this._register(languages.registerSignatureHelpProvider(languageIds, new SignatureHelpProvider(client), ['(', ',', '<', ')']))
    this._register(languages.registerDocumentSymbolProvider(languageIds, new DocumentSymbolProvider(client)))
    this._register(languages.registerRenameProvider(languageIds, new RenameProvider(client, this.fileConfigurationManager)))
    let formatProvider = new FormattingProvider(client, this.fileConfigurationManager)
    this._register(languages.registerDocumentFormatProvider(languageIds, formatProvider))
    this._register(languages.registerDocumentRangeFormatProvider(languageIds, formatProvider))
    this._register(languages.registerOnTypeFormattingEditProvider(languageIds, formatProvider, [';', '}', '\n', String.fromCharCode(27)]))
    this._register(languages.registerCodeActionProvider(languageIds, new InstallModuleProvider(client), 'tsserver'))

    let { fileConfigurationManager } = this
    let conf = fileConfigurationManager.getLanguageConfiguration(this.id)
    if (['javascript', 'typescript'].includes(this.id)) {
      if (this.client.apiVersion.gte(API.v290) && conf.get<boolean>('updateImportsOnFileMove.enable')) {
        this._register(new UpdateImportsOnFileRenameHandler(client, this.fileConfigurationManager, this.id))
      }
    }

    if (this.client.apiVersion.gte(API.v280)) {
      this._register(languages.registerFoldingRangeProvider(languageIds, new Folding(this.client)))
      this._register(
        languages.registerCodeActionProvider(languageIds,
          new OrganizeImportsCodeActionProvider(this.client, this.fileConfigurationManager),
          'tsserver', [CodeActionKind.SourceOrganizeImports])
      )
    }
    if (this.client.apiVersion.gte(API.v240)) {
      this._register(
        languages.registerCodeActionProvider(
          languageIds,
          new RefactorProvider(client, this.fileConfigurationManager),
          'tsserver',
          [CodeActionKind.Refactor]))
    }
    this._register(
      languages.registerCodeActionProvider(
        languageIds, new QuickfixProvider(client, this.fileConfigurationManager),
        'tsserver', [CodeActionKind.QuickFix]))
    this._register(
      languages.registerCodeActionProvider(
        languageIds, new ImportfixProvider(this.client.bufferSyncSupport),
        'tsserver', [CodeActionKind.QuickFix]))
    let cachedResponse = new CachedNavTreeResponse()
    if (this.client.apiVersion.gte(API.v206) && conf.get<boolean>('referencesCodeLens.enable')) {
      this._register(languages.registerCodeLensProvider(languageIds, new ReferencesCodeLensProvider(client, cachedResponse)))
    }
    if (this.client.apiVersion.gte(API.v220) && conf.get<boolean>('implementationsCodeLens.enable')) {
      this._register(languages.registerCodeLensProvider(languageIds, new ImplementationsCodeLensProvider(client, cachedResponse)))
    }
    if (this.client.apiVersion.gte(API.v350)) {
      this._register(languages.registerSelectionRangeProvider(languageIds, new SmartSelection(this.client)))
    }
    // if (this.client.apiVersion.gte(API.v300)) {
    //   this._register(
    //     languages.registerCompletionItemProvider(
    //       `tsserver-${this.description.id}-tag`,
    //       'TSC',
    //       languageIds,
    //       new TagCompletionProvider(client),
    //       ['>']
    //     )
    //   )
    // }
  }

  public handles(resource: string, doc: TextDocument): boolean {
    if (doc && this.description.modeIds.indexOf(doc.languageId) >= 0) {
      return true
    }
    const base = path.basename(Uri.parse(resource).fsPath)
    return !!base && (!!this.description.configFilePattern && this.description.configFilePattern.test(base))
  }

  private get id(): string { // tslint:disable-line
    return this.description.id
  }

  public get diagnosticSource(): string {
    return this.description.diagnosticSource
  }

  public triggerAllDiagnostics(): void {
    this.client.bufferSyncSupport.requestAllDiagnostics()
  }

  public diagnosticsReceived(
    diagnosticsKind: DiagnosticKind,
    file: Uri,
    diagnostics: (Diagnostic & { reportUnnecessary: any })[]
  ): void {
    const config = workspace.getConfiguration(this.id, file.toString())
    const reportUnnecessary = config.get<boolean>('showUnused', true)
    this.client.diagnosticsManager.diagnosticsReceived(diagnosticsKind, file.toString(), diagnostics.filter(diag => {
      if (!reportUnnecessary) {
        diag.tags = undefined
        if (diag.reportUnnecessary && diag.severity === DiagnosticSeverity.Information) {
          return false
        }
      }
      return true
    }))
  }
}
