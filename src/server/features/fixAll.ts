/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CodeAction, CodeActionContext, CodeActionKind, CodeActionProvider, Diagnostic, Range, TextDocument, WorkspaceEdit } from 'coc.nvim'
import type * as Proto from '../protocol'
import { ITypeScriptServiceClient } from '../typescriptService'
import * as errorCodes from '../utils/errorCodes'
import * as fixNames from '../utils/fixNames'
import * as typeConverters from '../utils/typeConverters'
import { DiagnosticsManager } from './diagnostics'
import FileConfigurationManager from './fileConfigurationManager'

interface AutoFix {
  readonly codes: Set<number>
  readonly fixName: string
}

async function buildIndividualFixes(
  fixes: readonly AutoFix[],
  edit: WorkspaceEdit,
  client: ITypeScriptServiceClient,
  file: string,
  diagnostics: readonly Diagnostic[],
  token: CancellationToken,
): Promise<void> {
  for (const diagnostic of diagnostics) {
    for (const { codes, fixName } of fixes) {
      if (token.isCancellationRequested) {
        return
      }

      if (!codes.has(diagnostic.code as number)) {
        continue
      }

      const args: Proto.CodeFixRequestArgs = {
        ...typeConverters.Range.toFileRangeRequestArgs(file, diagnostic.range),
        errorCodes: [+(diagnostic.code!)]
      }

      const response = await client.execute('getCodeFixes', args, token)
      if (response.type !== 'response') {
        continue
      }

      const fix = response.body?.find(fix => fix.fixName === fixName)
      if (fix) {
        typeConverters.WorkspaceEdit.withFileCodeEdits(edit, client, fix.changes)
        break
      }
    }
  }
}

async function buildCombinedFix(
  fixes: readonly AutoFix[],
  edit: WorkspaceEdit,
  client: ITypeScriptServiceClient,
  file: string,
  diagnostics: readonly Diagnostic[],
  token: CancellationToken,
): Promise<void> {
  for (const diagnostic of diagnostics) {
    for (const { codes, fixName } of fixes) {
      if (token.isCancellationRequested) {
        return
      }

      if (!codes.has(diagnostic.code as number)) {
        continue
      }

      const args: Proto.CodeFixRequestArgs = {
        ...typeConverters.Range.toFileRangeRequestArgs(file, diagnostic.range),
        errorCodes: [+(diagnostic.code!)]
      }

      const response = await client.execute('getCodeFixes', args, token)
      if (response.type !== 'response' || !response.body?.length) {
        continue
      }

      const fix = response.body?.find(fix => fix.fixName === fixName)
      if (!fix) {
        continue
      }

      if (!fix.fixId) {
        typeConverters.WorkspaceEdit.withFileCodeEdits(edit, client, fix.changes)
        return
      }

      const combinedArgs: Proto.GetCombinedCodeFixRequestArgs = {
        scope: {
          type: 'file',
          args: { file }
        },
        fixId: fix.fixId,
      }

      const combinedResponse = await client.execute('getCombinedCodeFix', combinedArgs, token)
      if (combinedResponse.type !== 'response' || !combinedResponse.body) {
        return
      }

      typeConverters.WorkspaceEdit.withFileCodeEdits(edit, client, combinedResponse.body.changes)
      return
    }
  }
}

// #region Source Actions

abstract class SourceAction implements CodeAction {
  static readonly kind: string
  public title: string
  public kind: CodeActionKind
  public edit: WorkspaceEdit | undefined
  abstract build(
    client: ITypeScriptServiceClient,
    file: string,
    diagnostics: readonly Diagnostic[],
    token: CancellationToken,
  ): Promise<void>
}

class SourceFixAll extends SourceAction {

  static readonly kind = CodeActionKind.SourceFixAll
  public readonly kind = CodeActionKind.SourceFixAll
  public readonly title = 'Fix all fixable JS/TS issues'
  public edit: WorkspaceEdit

  constructor() {
    super()
  }

  async build(client: ITypeScriptServiceClient, file: string, diagnostics: readonly Diagnostic[], token: CancellationToken): Promise<void> {
    this.edit = { changes: {} }

    await buildIndividualFixes([
      { codes: errorCodes.incorrectlyImplementsInterface, fixName: fixNames.classIncorrectlyImplementsInterface },
      { codes: errorCodes.asyncOnlyAllowedInAsyncFunctions, fixName: fixNames.awaitInSyncFunction },
    ], this.edit, client, file, diagnostics, token)

    await buildCombinedFix([
      { codes: errorCodes.unreachableCode, fixName: fixNames.unreachableCode }
    ], this.edit, client, file, diagnostics, token)
  }
}

class SourceRemoveUnused extends SourceAction {
  static readonly kind = CodeActionKind.Source
  public readonly kind = CodeActionKind.Source
  public readonly title = 'Remove all unused code'
  public edit: WorkspaceEdit

  constructor() {
    super()
  }

  async build(client: ITypeScriptServiceClient, file: string, diagnostics: readonly Diagnostic[], token: CancellationToken): Promise<void> {
    this.edit = { changes: {} }
    await buildCombinedFix([
      { codes: errorCodes.variableDeclaredButNeverUsed, fixName: fixNames.unusedIdentifier },
    ], this.edit, client, file, diagnostics, token)
  }
}

class SourceAddMissingImports extends SourceAction {

  static readonly kind = CodeActionKind.Source
  public readonly kind = CodeActionKind.Source
  public readonly title = 'Add all missing imports'
  public edit: WorkspaceEdit

  constructor() {
    super()
  }

  async build(client: ITypeScriptServiceClient, file: string, diagnostics: readonly Diagnostic[], token: CancellationToken): Promise<void> {
    this.edit = { changes: {} }
    await buildCombinedFix([
      { codes: errorCodes.cannotFindName, fixName: fixNames.fixImport }
    ],
      this.edit, client, file, diagnostics, token)
  }
}

//#endregion

export class TypeScriptAutoFixProvider implements CodeActionProvider {

  private static kindProviders = [
    SourceFixAll,
    SourceRemoveUnused,
    SourceAddMissingImports,
  ];

  constructor(
    private readonly client: ITypeScriptServiceClient,
    private readonly fileConfigurationManager: FileConfigurationManager,
    private readonly diagnosticsManager: DiagnosticsManager,
  ) {}

  public async provideCodeActions(
    document: TextDocument,
    _range: Range,
    context: CodeActionContext,
    token: CancellationToken
  ): Promise<CodeAction[] | undefined> {
    if (!context.only || !context.only.some(s => s === CodeActionKind.Source)) {
      return undefined
    }

    const file = this.client.toOpenedFilePath(document.uri)
    if (!file) {
      return undefined
    }

    const actions = this.getFixAllActions(context.only)
    if (this.client.bufferSyncSupport.hasPendingDiagnostics(document.uri)) {
      return actions
    }

    const diagnostics = this.diagnosticsManager.getDiagnostics(document.uri)
    if (!diagnostics.length) {
      // Actions are a no-op in this case but we still want to return them
      return actions
    }

    await this.fileConfigurationManager.ensureConfigurationForDocument(document, token)

    if (token.isCancellationRequested) {
      return undefined
    }

    await Promise.allSettled(actions.map(action => action.build(this.client, file, diagnostics, token)))

    return actions.filter(o => o.edit != null)
  }

  private getFixAllActions(only: string[]): SourceAction[] {
    return TypeScriptAutoFixProvider.kindProviders
      .filter(provider => only.some(s => provider.kind.startsWith(s)))
      .map(provider => new provider())
  }
}
