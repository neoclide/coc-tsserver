/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Diagnostic, Disposable, CodeActionKind, DiagnosticSeverity } from 'vscode-languageserver-protocol'
import { Uri, workspace, commands, events, languages, DiagnosticKind, ServiceStat, disposeAll } from 'coc.nvim'
import { CachedNavTreeResponse } from './features/baseCodeLensProvider'
import CompletionItemProvider from './features/completionItemProvider'
import DefinitionProvider from './features/definitionProvider'
import DirectiveCommentCompletionProvider from './features/directiveCommentCompletions'
import DocumentHighlight from './features/documentHighlight'
import DocumentSymbolProvider from './features/documentSymbol'
import FileConfigurationManager from './features/fileConfigurationManager'
import Folding from './features/folding'
import FormattingProvider from './features/formatting'
import HoverProvider from './features/hover'
import ImplementationsCodeLensProvider from './features/implementationsCodeLens'
// import TagCompletionProvider from './features/tagCompletion'
import QuickfixProvider from './features/quickfix'
import ImportfixProvider from './features/importFix'
import RefactorProvider from './features/refactor'
import ReferenceProvider from './features/references'
import ReferencesCodeLensProvider from './features/referencesCodeLens'
import RenameProvider from './features/rename'
import SignatureHelpProvider from './features/signatureHelp'
import UpdateImportsOnFileRenameHandler from './features/updatePathOnRename'
import WatchBuild from './features/watchBuild'
import WorkspaceSymbolProvider from './features/workspaceSymbols'
import SmartSelection from './features/smartSelect'
import TypeScriptServiceClient from './typescriptServiceClient'
import InstallModuleProvider from './features/moduleInstall'
import API from './utils/api'
import { LanguageDescription } from './utils/languageDescription'
import TypingsStatus from './utils/typingsStatus'
import { OrganizeImportsCodeActionProvider } from './organizeImports'

const suggestionSetting = 'suggestionActions.enabled'

export default class LanguageProvider {
  public readonly fileConfigurationManager: FileConfigurationManager // tslint:disable-line
  private readonly disposables: Disposable[] = []

  constructor(
    public client: TypeScriptServiceClient,
    private description: LanguageDescription,
    typingsStatus: TypingsStatus
  ) {
    this.fileConfigurationManager = new FileConfigurationManager(client)

    workspace.onDidChangeConfiguration(this.configurationChanged, this, this.disposables)
    this.configurationChanged()

    events.on('BufEnter', bufnr => {
      let doc = workspace.getDocument(bufnr)
      if (!doc || client.state !== ServiceStat.Running) return
      if (description.modeIds.indexOf(doc.filetype) == -1) return
      this.fileConfigurationManager.ensureConfigurationForDocument(doc.textDocument) // tslint:disable-line
    }, this, this.disposables)

    let initialized = false

    client.onTsServerStarted(async () => { // tslint:disable-line
      if (!initialized) {
        for (let doc of workspace.documents) {
          if (description.modeIds.indexOf(doc.filetype) !== -1) {
            this.fileConfigurationManager.ensureConfigurationForDocument(doc.textDocument) // tslint:disable-line
          }
        }
        initialized = true
        this.registerProviders(client, typingsStatus)
      } else {
        this.client.diagnosticsManager.reInitialize()
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

  private registerProviders(
    client: TypeScriptServiceClient,
    typingsStatus: TypingsStatus
  ): void {
    let languageIds = this.description.modeIds

    this.disposables.push(
      languages.registerCompletionItemProvider(
        `tsserver-${this.description.id}`,
        'TSC',
        languageIds,
        new CompletionItemProvider(
          client,
          typingsStatus,
          this.fileConfigurationManager,
          this.description.id
        ),
        CompletionItemProvider.triggerCharacters
      )
    )

    if (this.client.apiVersion.gte(API.v230)) {
      this.disposables.push(
        languages.registerCompletionItemProvider(
          `${this.description.id}-directive`,
          'TSC',
          languageIds,
          new DirectiveCommentCompletionProvider(
            client,
          ),
          ['@']
        )
      )
    }
    let definitionProvider = new DefinitionProvider(client)

    this.disposables.push(
      languages.registerDefinitionProvider(
        languageIds,
        definitionProvider
      )
    )

    this.disposables.push(
      languages.registerTypeDefinitionProvider(
        languageIds,
        definitionProvider
      )
    )

    this.disposables.push(
      languages.registerImplementationProvider(
        languageIds,
        definitionProvider
      )
    )

    this.disposables.push(
      languages.registerReferencesProvider(
        languageIds,
        new ReferenceProvider(client)
      )
    )

    this.disposables.push(
      languages.registerHoverProvider(
        languageIds,
        new HoverProvider(client))
    )

    this.disposables.push(
      languages.registerDocumentHighlightProvider(languageIds, new DocumentHighlight(this.client))
    )

    this.disposables.push(
      languages.registerSignatureHelpProvider(
        languageIds,
        new SignatureHelpProvider(client),
        ['(', ',', '<', ')'])
    )

    this.disposables.push(
      languages.registerDocumentSymbolProvider(
        languageIds,
        new DocumentSymbolProvider(client))
    )

    this.disposables.push(
      languages.registerWorkspaceSymbolProvider(
        languageIds,
        new WorkspaceSymbolProvider(client, languageIds))
    )

    this.disposables.push(
      languages.registerRenameProvider(
        languageIds,
        new RenameProvider(client))
    )
    let formatProvider = new FormattingProvider(client, this.fileConfigurationManager)
    this.disposables.push(
      languages.registerDocumentFormatProvider(languageIds, formatProvider)
    )
    this.disposables.push(
      languages.registerDocumentRangeFormatProvider(languageIds, formatProvider)
    )
    this.disposables.push(
      languages.registerOnTypeFormattingEditProvider(languageIds, formatProvider, [';', '}', '\n', String.fromCharCode(27)])
    )

    // this.disposables.push(
    //   new ProjectError(client, commandManager)
    // )

    if (this.client.apiVersion.gte(API.v280)) {
      this.disposables.push(
        languages.registerFoldingRangeProvider(languageIds, new Folding(this.client))
      )
      this.disposables.push(
        languages.registerCodeActionProvider(languageIds,
          new OrganizeImportsCodeActionProvider(this.client, this.fileConfigurationManager),
          `tsserver-${this.description.id}`, [CodeActionKind.SourceOrganizeImports])
      )
    }

    let { fileConfigurationManager } = this
    let conf = fileConfigurationManager.getLanguageConfiguration(this.id)

    if (this.client.apiVersion.gte(API.v290)
      && conf.get<boolean>('updateImportsOnFileMove.enable')) {
      this.disposables.push(
        new UpdateImportsOnFileRenameHandler(client, this.fileConfigurationManager, this.id)
      )
    }

    if (this.client.apiVersion.gte(API.v240)) {
      this.disposables.push(
        languages.registerCodeActionProvider(
          languageIds,
          new RefactorProvider(client, this.fileConfigurationManager),
          'tsserver',
          [CodeActionKind.Refactor]))
    }

    this.disposables.push(
      languages.registerCodeActionProvider(
        languageIds,
        new InstallModuleProvider(client),
        'tsserver')
    )

    this.disposables.push(
      languages.registerCodeActionProvider(
        languageIds,
        new QuickfixProvider(client),
        'tsserver',
        [CodeActionKind.QuickFix]))

    this.disposables.push(
      languages.registerCodeActionProvider(
        languageIds,
        new ImportfixProvider(this.client.bufferSyncSupport),
        'tsserver',
        [CodeActionKind.QuickFix]))
    let cachedResponse = new CachedNavTreeResponse()
    if (this.client.apiVersion.gte(API.v206)
      && conf.get<boolean>('referencesCodeLens.enable')) {
      this.disposables.push(
        languages.registerCodeLensProvider(
          languageIds,
          new ReferencesCodeLensProvider(client, cachedResponse)))
    }

    if (this.client.apiVersion.gte(API.v220)
      && conf.get<boolean>('implementationsCodeLens.enable')) {
      this.disposables.push(
        languages.registerCodeLensProvider(
          languageIds,
          new ImplementationsCodeLensProvider(client, cachedResponse)))
    }
    if (this.client.apiVersion.gte(API.v350)) {
      this.disposables.push(
        languages.registerSelectionRangeProvider(languageIds, new SmartSelection(this.client))
      )
    }

    if (this.description.id == 'typescript') {
      // this.client.apiVersion
      this.disposables.push(
        new WatchBuild(commands, this.client)
      )
    }

    // if (this.client.apiVersion.gte(API.v300)) {
    //   this.disposables.push(
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

  public handles(resource: Uri): boolean {
    let { modeIds, configFile } = this.description
    if (resource.toString().endsWith(configFile)) {
      return true
    }
    let doc = workspace.getDocument(resource.toString())
    if (doc && modeIds.indexOf(doc.filetype) !== -1) {
      return true
    }
    let str = resource.toString()
    if (this.id === 'typescript' && /\.ts(x)?$/.test(str)) {
      return true
    }
    if (this.id === 'javascript' && /\.js(x)?$/.test(str)) {
      return true
    }
    return false
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
    if (!this.client.bufferSyncSupport.shouldValidate(file.toString())) {
      return
    }
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
