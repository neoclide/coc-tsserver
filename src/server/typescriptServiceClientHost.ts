/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Uri, DiagnosticKind, disposeAll, workspace } from 'coc.nvim'
import { Range, Diagnostic, DiagnosticSeverity, Disposable, Position, CancellationToken, DiagnosticRelatedInformation } from 'vscode-languageserver-protocol'
import LanguageProvider from './languageProvider'
import * as Proto from './protocol'
import * as PConst from './protocol.const'
import FileConfigurationManager from './features/fileConfigurationManager'
import TypeScriptServiceClient from './typescriptServiceClient'
import { LanguageDescription } from './utils/languageDescription'
import * as typeConverters from './utils/typeConverters'
import TypingsStatus, { AtaProgressReporter } from './utils/typingsStatus'
import { PluginManager } from '../utils/plugins'
import { flatten } from '../utils/arrays'

// Style check diagnostics that can be reported as warnings
const styleCheckDiagnostics = [
  6133, // variable is declared but never used
  6138, // property is declared but its value is never read
  7027, // unreachable code detected
  7028, // unused label
  7029, // fall through case in switch
  7030 // not all code paths return a value
]

export default class TypeScriptServiceClientHost implements Disposable {
  private readonly ataProgressReporter: AtaProgressReporter
  private readonly typingsStatus: TypingsStatus
  private readonly client: TypeScriptServiceClient
  private readonly languages: LanguageProvider[] = []
  private readonly languagePerId = new Map<string, LanguageProvider>()
  private readonly disposables: Disposable[] = []
  private readonly fileConfigurationManager: FileConfigurationManager
  private reportStyleCheckAsWarnings = true

  constructor(descriptions: LanguageDescription[], pluginManager: PluginManager) {
    let timer: NodeJS.Timer
    const handleProjectChange = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        this.triggerAllDiagnostics()
      }, 1500)
    }

    const configFileWatcher = workspace.createFileSystemWatcher('**/[tj]sconfig.json')
    this.disposables.push(configFileWatcher)
    configFileWatcher.onDidCreate(this.reloadProjects, this, this.disposables)
    configFileWatcher.onDidDelete(this.reloadProjects, this, this.disposables)
    configFileWatcher.onDidChange(handleProjectChange, this, this.disposables)
    const packageFileWatcher = workspace.createFileSystemWatcher('**/package.json')
    packageFileWatcher.onDidCreate(this.reloadProjects, this, this.disposables)
    packageFileWatcher.onDidChange(handleProjectChange, this, this.disposables)

    const allModeIds = this.getAllModeIds(descriptions, pluginManager)
    this.client = new TypeScriptServiceClient(pluginManager, allModeIds)
    this.disposables.push(this.client)
    this.client.onDiagnosticsReceived(({ kind, resource, diagnostics }) => {
      this.diagnosticsReceived(kind, resource, diagnostics).catch(e => {
        console.error(e)
      })
    }, null, this.disposables)

    this.client.onConfigDiagnosticsReceived(diag => {
      let { body } = diag
      if (body) {
        let { configFile, diagnostics } = body
        let uri = Uri.file(configFile)
        if (diagnostics.length == 0) {
          this.client.diagnosticsManager.configFileDiagnosticsReceived(uri.toString(), [])
        } else {
          let diagnosticList = diagnostics.map(o => {
            let { text, code, category, start, end } = o
            let range: Range
            if (!start || !end) {
              range = Range.create(Position.create(0, 0), Position.create(0, 1))
            } else {
              range = Range.create(start.line - 1, start.offset - 1, end.line - 1, end.offset - 1)
            }
            let severity = category == 'error' ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning
            return Diagnostic.create(range, text, severity, code)
          })
          this.client.diagnosticsManager.configFileDiagnosticsReceived(uri.toString(), diagnosticList)
        }
      }
    }, null, this.disposables)
    this.typingsStatus = new TypingsStatus(this.client)
    this.ataProgressReporter = new AtaProgressReporter(this.client)
    this.fileConfigurationManager = new FileConfigurationManager(this.client)
    for (const description of descriptions) { // tslint:disable-line
      const manager = new LanguageProvider(
        this.client,
        this.fileConfigurationManager,
        description,
        this.typingsStatus
      )
      this.languages.push(manager)
      this.disposables.push(manager)
      this.languagePerId.set(description.id, manager)
    }

    this.client.ensureServiceStarted()
    this.client.onTsServerStarted(() => {
      this.triggerAllDiagnostics()
    })
    workspace.onDidChangeConfiguration(this.configurationChanged, this, this.disposables)
    this.configurationChanged()
  }

  public dispose(): void {
    disposeAll(this.disposables)
    this.fileConfigurationManager.dispose()
    this.typingsStatus.dispose()
    this.ataProgressReporter.dispose()
  }

  public reset(): void {
    this.fileConfigurationManager.reset()
  }

  public get serviceClient(): TypeScriptServiceClient {
    return this.client
  }

  public reloadProjects(): void {
    this.client.execute('reloadProjects', null, CancellationToken.None)
    this.triggerAllDiagnostics()
  }

  // typescript or javascript
  public getProvider(languageId: string): LanguageProvider {
    return this.languagePerId.get(languageId)
  }

  private configurationChanged(): void {
    const config = workspace.getConfiguration('tsserver')
    this.reportStyleCheckAsWarnings = config.get('reportStyleChecksAsWarnings', true)
  }

  public async findLanguage(uri: string): Promise<LanguageProvider> {
    try {
      let doc = await workspace.loadFile(uri)
      if (!doc) return undefined
      return this.languages.find(language => language.handles(uri, doc.textDocument))
    } catch {
      return undefined
    }
  }

  public async handles(uri: string): Promise<boolean> {
    const provider = await this.findLanguage(uri)
    if (provider) {
      return true
    }
    return this.client.bufferSyncSupport.handles(uri)
  }

  private triggerAllDiagnostics(): void {
    for (const language of this.languagePerId.values()) {
      language.triggerAllDiagnostics()
    }
  }

  private async diagnosticsReceived(
    kind: DiagnosticKind,
    resource: Uri,
    diagnostics: Proto.Diagnostic[]
  ): Promise<void> {
    const language = await this.findLanguage(resource.toString())
    if (language) {
      language.diagnosticsReceived(
        kind,
        resource,
        this.createMarkerDatas(diagnostics))
    }
  }

  private createMarkerDatas(diagnostics: Proto.Diagnostic[]): (Diagnostic & { reportUnnecessary: any })[] {
    return diagnostics.map(tsDiag => this.tsDiagnosticToLspDiagnostic(tsDiag))
  }

  private tsDiagnosticToLspDiagnostic(diagnostic: Proto.Diagnostic): (Diagnostic & { reportUnnecessary: any }) {
    const { start, end, text } = diagnostic
    const range = {
      start: typeConverters.Position.fromLocation(start),
      end: typeConverters.Position.fromLocation(end)
    }
    let relatedInformation: DiagnosticRelatedInformation[]
    if (diagnostic.relatedInformation) {
      relatedInformation = diagnostic.relatedInformation.map(o => {
        let { span, message } = o
        return {
          location: typeConverters.Location.fromTextSpan(this.client.toResource(span.file), span),
          message
        }
      })
    }
    return {
      range,
      message: text,
      code: diagnostic.code ? diagnostic.code : null,
      severity: this.getDiagnosticSeverity(diagnostic),
      reportUnnecessary: diagnostic.reportsUnnecessary,
      source: diagnostic.source || 'tsserver',
      relatedInformation
    }
  }

  private getDiagnosticSeverity(diagnostic: Proto.Diagnostic): DiagnosticSeverity {
    if (
      this.reportStyleCheckAsWarnings &&
      this.isStyleCheckDiagnostic(diagnostic.code) &&
      diagnostic.category === PConst.DiagnosticCategory.error
    ) {
      return DiagnosticSeverity.Warning
    }

    switch (diagnostic.category) {
      case PConst.DiagnosticCategory.error:
        return DiagnosticSeverity.Error

      case PConst.DiagnosticCategory.warning:
        return DiagnosticSeverity.Warning

      case PConst.DiagnosticCategory.suggestion:
        return DiagnosticSeverity.Information

      default:
        return DiagnosticSeverity.Error
    }
  }

  private isStyleCheckDiagnostic(code: number | undefined): boolean {
    return code ? styleCheckDiagnostics.indexOf(code) !== -1 : false
  }

  private getAllModeIds(descriptions: LanguageDescription[], pluginManager: PluginManager) {
    const allModeIds = flatten([
      ...descriptions.map(x => x.modeIds),
      ...pluginManager.plugins.map(x => x.languages)
    ])
    return allModeIds
  }
}
