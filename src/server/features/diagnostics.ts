/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Diagnostic, DiagnosticCollection, DiagnosticTag, languages } from 'coc.nvim'
import * as arrays from '../utils/arrays'
import * as objects from '../utils/objects'
import { Disposable } from '../utils/dispose'
import { DiagnosticLanguage } from '../utils/languageDescription'
import { ResourceMap } from '../utils/resourceMap'

function diagnosticsEquals(a: Diagnostic, b: Diagnostic): boolean {
  if (a === b) return true
  return objects.equals(a, b)
}

export const enum DiagnosticKind {
  Syntax,
  Semantic,
  Suggestion,
}

class FileDiagnostics {
  private readonly _diagnostics = new Map<DiagnosticKind, ReadonlyArray<Diagnostic>>()

  constructor(
    public readonly file: string,
    public language: DiagnosticLanguage
  ) {}

  public updateDiagnostics(
    language: DiagnosticLanguage,
    kind: DiagnosticKind,
    diagnostics: ReadonlyArray<Diagnostic>
  ): boolean {
    if (language !== this.language) {
      this._diagnostics.clear()
      this.language = language
    }

    const existing = this._diagnostics.get(kind)
    if (arrays.equals(existing || arrays.empty, diagnostics, diagnosticsEquals)) {
      // No need to update
      return false
    }

    this._diagnostics.set(kind, diagnostics)
    return true
  }

  public getDiagnostics(settings: DiagnosticSettings): Diagnostic[] {
    if (!settings.getValidate(this.language)) {
      return []
    }

    return [
      ...this.get(DiagnosticKind.Syntax),
      ...this.get(DiagnosticKind.Semantic),
      ...this.getSuggestionDiagnostics(settings),
    ]
  }

  private getSuggestionDiagnostics(settings: DiagnosticSettings) {
    const enableSuggestions = settings.getEnableSuggestions(this.language)
    return this.get(DiagnosticKind.Suggestion).filter(x => {
      if (!enableSuggestions) {
        // Still show unused
        return x.tags && (x.tags.includes(DiagnosticTag.Unnecessary) || x.tags.includes(DiagnosticTag.Deprecated))
      }
      return true
    })
  }

  private get(kind: DiagnosticKind): ReadonlyArray<Diagnostic> {
    return this._diagnostics.get(kind) || []
  }
}

interface LanguageDiagnosticSettings {
  readonly validate: boolean
  readonly enableSuggestions: boolean
}

function areLanguageDiagnosticSettingsEqual(currentSettings: LanguageDiagnosticSettings, newSettings: LanguageDiagnosticSettings): boolean {
  return currentSettings.validate === newSettings.validate
    && currentSettings.enableSuggestions && currentSettings.enableSuggestions
}

class DiagnosticSettings {
  private static readonly defaultSettings: LanguageDiagnosticSettings = {
    validate: true,
    enableSuggestions: true
  };

  private readonly _languageSettings = new Map<DiagnosticLanguage, LanguageDiagnosticSettings>();

  public getValidate(language: DiagnosticLanguage): boolean {
    return this.get(language).validate
  }

  public setValidate(language: DiagnosticLanguage, value: boolean): boolean {
    return this.update(language, settings => ({
      validate: value,
      enableSuggestions: settings.enableSuggestions,
    }))
  }

  public getEnableSuggestions(language: DiagnosticLanguage): boolean {
    return this.get(language).enableSuggestions
  }

  public setEnableSuggestions(language: DiagnosticLanguage, value: boolean): boolean {
    return this.update(language, settings => ({
      validate: settings.validate,
      enableSuggestions: value
    }))
  }

  private get(language: DiagnosticLanguage): LanguageDiagnosticSettings {
    return this._languageSettings.get(language) || DiagnosticSettings.defaultSettings
  }

  private update(language: DiagnosticLanguage, f: (x: LanguageDiagnosticSettings) => LanguageDiagnosticSettings): boolean {
    const currentSettings = this.get(language)
    const newSettings = f(currentSettings)
    this._languageSettings.set(language, newSettings)
    return !areLanguageDiagnosticSettingsEqual(currentSettings, newSettings)
  }
}

export class DiagnosticsManager extends Disposable {
  private readonly _diagnostics: ResourceMap<FileDiagnostics>
  private readonly _settings = new DiagnosticSettings();
  private readonly _currentDiagnostics: DiagnosticCollection
  private readonly _pendingUpdates: ResourceMap<any>

  private readonly _updateDelay = 50;

  constructor() {
    super()
    this._diagnostics = new ResourceMap<FileDiagnostics>(undefined)
    this._pendingUpdates = new ResourceMap<any>(undefined)

    this._currentDiagnostics = this._register(languages.createDiagnosticCollection('tsserver'))
  }

  public override dispose() {
    super.dispose()

    for (const value of this._pendingUpdates.values) {
      clearTimeout(value)
    }
    this._pendingUpdates.clear()
  }

  public reInitialize(): void {
    this._currentDiagnostics.clear()
    this._diagnostics.clear()
  }

  public setValidate(language: DiagnosticLanguage, value: boolean) {
    const didUpdate = this._settings.setValidate(language, value)
    if (didUpdate) {
      this.rebuild()
    }
  }

  public setEnableSuggestions(language: DiagnosticLanguage, value: boolean) {
    const didUpdate = this._settings.setEnableSuggestions(language, value)
    if (didUpdate) {
      this.rebuild()
    }
  }

  public updateDiagnostics(
    uri: string,
    language: DiagnosticLanguage,
    kind: DiagnosticKind,
    diagnostics: ReadonlyArray<Diagnostic>
  ): void {
    let didUpdate = false
    const entry = this._diagnostics.get(uri)
    if (entry) {
      didUpdate = entry.updateDiagnostics(language, kind, diagnostics)
    } else if (diagnostics.length) {
      const fileDiagnostics = new FileDiagnostics(uri, language)
      fileDiagnostics.updateDiagnostics(language, kind, diagnostics)
      this._diagnostics.set(uri, fileDiagnostics)
      didUpdate = true
    }

    if (didUpdate) {
      this.scheduleDiagnosticsUpdate(uri)
    }
  }

  public configFileDiagnosticsReceived(
    uri: string,
    diagnostics: Diagnostic[]
  ): void {
    this._currentDiagnostics.set(uri, diagnostics)
  }

  public delete(resource: string): void {
    this._currentDiagnostics.delete(resource)
    this._diagnostics.delete(resource)
  }

  public getDiagnostics(resource: string): ReadonlyArray<Diagnostic> {
    return this._currentDiagnostics.get(resource) || []
  }

  private scheduleDiagnosticsUpdate(resource: string) {
    if (!this._pendingUpdates.has(resource)) {
      this._pendingUpdates.set(resource, setTimeout(() => this.updateCurrentDiagnostics(resource), this._updateDelay))
    }
  }

  private updateCurrentDiagnostics(resource: string): void {
    if (this._pendingUpdates.has(resource)) {
      clearTimeout(this._pendingUpdates.get(resource))
      this._pendingUpdates.delete(resource)
    }

    const fileDiagnostics = this._diagnostics.get(resource)
    this._currentDiagnostics.set(resource, fileDiagnostics ? fileDiagnostics.getDiagnostics(this._settings) : [])
  }

  private rebuild(): void {
    this._currentDiagnostics.clear()
    for (const fileDiagnostic of this._diagnostics.values) {
      this._currentDiagnostics.set(fileDiagnostic.file, fileDiagnostic.getDiagnostics(this._settings))
    }
  }
}
