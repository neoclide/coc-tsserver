/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as languageModeIds from './languageModeIds'

export interface LanguageDescription {
  readonly id: string
  readonly diagnosticSource: string
  readonly diagnosticLanguage: DiagnosticLanguage
  readonly modeIds: string[]
  readonly configFile?: string
  readonly isExternal?: boolean
  readonly diagnosticOwner: string
  readonly configFilePattern?: RegExp
}

export const enum DiagnosticLanguage {
  JavaScript,
  TypeScript
}

export const standardLanguageDescriptions: LanguageDescription[] = [
  {
    id: 'typescript',
    diagnosticSource: 'ts',
    diagnosticOwner: 'typescript',
    modeIds: [languageModeIds.typescript, languageModeIds.typescriptreact,
    languageModeIds.typescripttsx, languageModeIds.typescriptjsx],
    diagnosticLanguage: DiagnosticLanguage.TypeScript,
    configFile: 'tsconfig.json',
    configFilePattern: /^tsconfig(\..*)?\.json$/gi
  },
  {
    id: 'javascript',
    diagnosticSource: 'ts',
    diagnosticOwner: 'typescript',
    modeIds: [languageModeIds.javascript, languageModeIds.javascriptreact, languageModeIds.javascriptjsx],
    diagnosticLanguage: DiagnosticLanguage.JavaScript,
    configFile: 'jsconfig.json',
    configFilePattern: /^jsconfig(\..*)?\.json$/gi
  }
]
