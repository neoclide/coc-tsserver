/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as languageModeIds from './languageModeIds'
import path from 'path'
import { Uri } from 'coc.nvim'

export interface LanguageDescription {
  readonly id: string
  readonly diagnosticSource: string
  readonly diagnosticLanguage: DiagnosticLanguage
  readonly languageIds: string[]
  readonly isExternal?: boolean
  readonly diagnosticOwner: string
  readonly configFilePattern?: RegExp
  readonly standardFileExtensions: ReadonlyArray<string>,
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
    diagnosticLanguage: DiagnosticLanguage.TypeScript,
    languageIds: [languageModeIds.typescript, languageModeIds.typescriptreact, languageModeIds.typescripttsx, languageModeIds.typescriptjsx],
    configFilePattern: /^tsconfig(\..*)?\.json$/gi,
    standardFileExtensions: [
      'ts',
      'tsx',
      'cts',
      'mts'
    ]
  },
  {
    id: 'javascript',
    diagnosticSource: 'ts',
    diagnosticOwner: 'typescript',
    languageIds: [languageModeIds.javascript, languageModeIds.javascriptreact, languageModeIds.javascriptjsx], diagnosticLanguage: DiagnosticLanguage.JavaScript,
    configFilePattern: /^jsconfig(\..*)?\.json$/gi,
    standardFileExtensions: [
      'js',
      'jsx',
      'cjs',
      'mjs',
      'es6',
      'pac',
    ]
  }
]

export function isTsConfigFileName(fileName: string): boolean {
  return /^tsconfig\.(.+\.)?json$/i.test(path.basename(fileName))
}

export function isJsConfigOrTsConfigFileName(fileName: string): boolean {
  return /^[jt]sconfig\.(.+\.)?json$/i.test(path.basename(fileName))
}

export function doesResourceLookLikeATypeScriptFile(resource: Uri): boolean {
  return /\.(tsx?|mts|cts)$/i.test(resource.fsPath)
}

export function doesResourceLookLikeAJavaScriptFile(resource: Uri): boolean {
  return /\.(jsx?|mjs|cjs)$/i.test(resource.fsPath)
}
