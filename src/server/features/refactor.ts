import { CodeActionProvider, CodeActionProviderMetadata, commands, TextDocument, window, workspace } from 'coc.nvim'
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken, CodeAction, CodeActionContext, CodeActionKind, Range, WorkspaceEdit } from 'vscode-languageserver-protocol'
import { Command, registCommand } from '../commands'
import Proto from '../protocol'
import { ITypeScriptServiceClient } from '../typescriptService'
import * as typeConverters from '../utils/typeConverters'
import FormattingOptionsManager from './fileConfigurationManager'

namespace Experimental {
  export interface RefactorActionInfo extends Proto.RefactorActionInfo {
    readonly notApplicableReason?: string
  }
}

class ApplyRefactoringCommand implements Command {
  public static readonly ID = '_typescript.applyRefactoring'
  public readonly id = ApplyRefactoringCommand.ID

  constructor(private readonly client: ITypeScriptServiceClient) {}

  public async execute(
    document: TextDocument,
    file: string,
    refactor: string,
    action: string,
    range: Range
  ): Promise<boolean> {
    const args: Proto.GetEditsForRefactorRequestArgs = {
      ...typeConverters.Range.toFileRangeRequestArgs(file, range),
      refactor,
      action
    }
    const response = await this.client.execute('getEditsForRefactor', args, CancellationToken.None) as any
    const body = response && response.body
    if (!body || !body.edits.length) {
      return false
    }

    const workspaceEdit = await this.toWorkspaceEdit(body)
    if (!(await workspace.applyEdit(workspaceEdit))) {
      return false
    }
    const renameLocation = body.renameLocation
    if (renameLocation) {
      commands.executeCommand('editor.action.rename',
        document.uri,
        typeConverters.Position.fromLocation(renameLocation)
      )
    }
    return true
  }

  private async toWorkspaceEdit(body: Proto.RefactorEditInfo): Promise<WorkspaceEdit> {
    for (const edit of body.edits) {
      await workspace.createFile(edit.fileName, { ignoreIfExists: true })
    }
    let workspaceEdit = typeConverters.WorkspaceEdit.fromFileCodeEdits(
      this.client,
      body.edits
    )
    return workspaceEdit
  }
}

class SelectRefactorCommand implements Command {
  public static readonly ID = '_typescript.selectRefactoring'
  public readonly id = SelectRefactorCommand.ID

  constructor(private readonly doRefactoring: ApplyRefactoringCommand) {}

  public async execute(
    document: TextDocument,
    file: string,
    info: Proto.ApplicableRefactorInfo,
    range: Range
  ): Promise<boolean> {
    let { actions } = info
    const idx = actions.length == 1 ? 0 : await window.showQuickpick(
      actions.map(action => action.description || action.name)
    )
    if (idx == -1) return false
    let label = info.actions[idx].name
    if (!label) return false
    return this.doRefactoring.execute(
      document,
      file,
      info.name,
      label,
      range
    )
  }
}

export default class TypeScriptRefactorProvider implements CodeActionProvider {
  private static readonly extractFunctionKind = CodeActionKind.RefactorExtract + '.function'
  private static readonly extractConstantKind = CodeActionKind.RefactorExtract + '.constant'
  private static readonly moveKind = CodeActionKind.Refactor + '.move'

  constructor(
    private readonly client: ITypeScriptServiceClient,
    private readonly formattingOptionsManager: FormattingOptionsManager,
  ) {
    const doRefactoringCommand = new ApplyRefactoringCommand(this.client)
    registCommand(doRefactoringCommand)
    registCommand(new SelectRefactorCommand(doRefactoringCommand))
  }

  public static readonly metadata: CodeActionProviderMetadata = {
    providedCodeActionKinds: [CodeActionKind.Refactor]
  }

  public async provideCodeActions(
    document: TextDocument,
    range: Range,
    context: CodeActionContext,
    token: CancellationToken
  ): Promise<CodeAction[] | undefined> {
    if (!this.shouldTrigger(context)) {
      return undefined
    }
    const file = this.client.toPath(document.uri)
    if (!file) return undefined
    await this.formattingOptionsManager.ensureConfigurationForDocument(document, token)
    const args: Proto.GetApplicableRefactorsRequestArgs = typeConverters.Range.toFileRangeRequestArgs(
      file,
      range
    )
    let response
    try {
      response = await this.client.interruptGetErr(() => {
        return this.client.execute('getApplicableRefactors', args, token)
      })
      if (!response || !response.body) {
        return undefined
      }
    } catch {
      return undefined
    }

    return this.convertApplicableRefactors(
      response.body,
      document,
      file,
      range,
      context.only && context.only.some(v => v.includes(CodeActionKind.Refactor))
    )
  }

  private convertApplicableRefactors(
    body: Proto.ApplicableRefactorInfo[],
    document: TextDocument,
    file: string,
    rangeOrSelection: Range,
    setPrefrred: boolean
  ): CodeAction[] {
    const actions: CodeAction[] = []
    for (const info of body) {
      // ignore not refactor that not applicable
      if ((info as Experimental.RefactorActionInfo).notApplicableReason) continue
      if (!info.inlineable) {
        const codeAction: CodeAction = {
          title: info.description,
          kind: CodeActionKind.Refactor
        }
        codeAction.command = {
          title: info.description,
          command: SelectRefactorCommand.ID,
          arguments: [document, file, info, rangeOrSelection]
        }
        actions.push(codeAction)
      } else {
        for (const action of info.actions) {
          let codeAction = this.refactorActionToCodeAction(action, document, file, info, rangeOrSelection)
          if (setPrefrred) {
            codeAction.isPreferred = TypeScriptRefactorProvider.isPreferred(action, info.actions)
          }
          actions.push(codeAction)
        }
      }
    }
    return actions
  }

  private refactorActionToCodeAction(
    action: Proto.RefactorActionInfo,
    document: TextDocument,
    file: string,
    info: Proto.ApplicableRefactorInfo,
    rangeOrSelection: Range
  ): CodeAction {
    const codeAction: CodeAction = {
      title: action.description,
      kind: TypeScriptRefactorProvider.getKind(action)
    }
    codeAction.command = {
      title: action.description,
      command: ApplyRefactoringCommand.ID,
      arguments: [document, file, info.name, action.name, rangeOrSelection]
    }
    return codeAction
  }

  private shouldTrigger(context: CodeActionContext): boolean {
    if (
      context.only &&
      context.only.every(o => !o.includes(CodeActionKind.Refactor))
    ) {
      return false
    }
    return true
  }

  private static getKind(refactor: Proto.RefactorActionInfo): string {
    if (refactor.name.startsWith('function_')) {
      return TypeScriptRefactorProvider.extractFunctionKind
    } else if (refactor.name.startsWith('constant_')) {
      return TypeScriptRefactorProvider.extractConstantKind
    } else if (refactor.name.startsWith('Move')) {
      return TypeScriptRefactorProvider.moveKind
    }
    return CodeActionKind.Refactor
  }

  private static isPreferred(
    action: Proto.RefactorActionInfo,
    allActions: readonly Proto.RefactorActionInfo[],
  ): boolean {
    let kind = TypeScriptRefactorProvider.getKind(action)
    if (TypeScriptRefactorProvider.extractConstantKind == kind) {
      // Only mark the action with the lowest scope as preferred
      const getScope = (name: string) => {
        const scope = name.match(/scope_(\d)/)?.[1]
        return scope ? +scope : undefined
      }
      const scope = getScope(action.name)
      if (typeof scope !== 'number') {
        return false
      }

      return allActions
        .filter(otherAtion => otherAtion !== action && otherAtion.name.startsWith('constant_'))
        .every(otherAction => {
          const otherScope = getScope(otherAction.name)
          return typeof otherScope === 'number' ? scope < otherScope : true
        })
    }
    let { name } = action
    if (name.startsWith('Extract to type alias') || name.startsWith('Extract to interface')) {
      return true
    }
    return false
  }
}
