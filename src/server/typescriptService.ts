/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken, Event } from 'vscode-languageserver-protocol'
import { Uri } from 'coc.nvim'
import * as Proto from './protocol'
import API from './utils/api'
import { TypeScriptServiceConfiguration } from './utils/configuration'
import Logger from './utils/logger'

export namespace ServerResponse {

  export class Cancelled {
    public readonly type = 'cancelled'

    constructor(
      public readonly reason: string
    ) { }
  }

  // tslint:disable-next-line: new-parens
  export const NoContent = new class { public readonly type = 'noContent' }

  export type Response<T extends Proto.Response> = T | Cancelled | typeof NoContent
}

export interface TypeScriptServerPlugin {
  readonly path: string
  readonly name: string
  readonly languages: string[]
}

export interface TypeScriptRequestTypes {
  'applyCodeActionCommand': [Proto.ApplyCodeActionCommandRequestArgs, Proto.ApplyCodeActionCommandResponse]
  'completionEntryDetails': [Proto.CompletionDetailsRequestArgs, Proto.CompletionDetailsResponse]
  'completionInfo': [Proto.CompletionsRequestArgs, Proto.CompletionInfoResponse]
  // tslint:disable-next-line: deprecation
  'completions': [Proto.CompletionsRequestArgs, Proto.CompletionsResponse]
  'configure': [Proto.ConfigureRequestArguments, Proto.ConfigureResponse]
  'definition': [Proto.FileLocationRequestArgs, Proto.DefinitionResponse]
  'definitionAndBoundSpan': [Proto.FileLocationRequestArgs, Proto.DefinitionInfoAndBoundSpanReponse]
  'docCommentTemplate': [Proto.FileLocationRequestArgs, Proto.DocCommandTemplateResponse]
  'documentHighlights': [Proto.DocumentHighlightsRequestArgs, Proto.DocumentHighlightsResponse]
  'format': [Proto.FormatRequestArgs, Proto.FormatResponse]
  'formatonkey': [Proto.FormatOnKeyRequestArgs, Proto.FormatResponse]
  'getApplicableRefactors': [Proto.GetApplicableRefactorsRequestArgs, Proto.GetApplicableRefactorsResponse]
  'getCodeFixes': [Proto.CodeFixRequestArgs, Proto.CodeFixResponse]
  'getCombinedCodeFix': [Proto.GetCombinedCodeFixRequestArgs, Proto.GetCombinedCodeFixResponse]
  'getEditsForFileRename': [Proto.GetEditsForFileRenameRequestArgs, Proto.GetEditsForFileRenameResponse]
  'getEditsForRefactor': [Proto.GetEditsForRefactorRequestArgs, Proto.GetEditsForRefactorResponse]
  'getOutliningSpans': [Proto.FileRequestArgs, Proto.OutliningSpansResponse]
  'getSupportedCodeFixes': [null, Proto.GetSupportedCodeFixesResponse]
  'implementation': [Proto.FileLocationRequestArgs, Proto.ImplementationResponse]
  'jsxClosingTag': [Proto.JsxClosingTagRequestArgs, Proto.JsxClosingTagResponse]
  'navto': [Proto.NavtoRequestArgs, Proto.NavtoResponse]
  'navtree': [Proto.FileRequestArgs, Proto.NavTreeResponse]
  'organizeImports': [Proto.OrganizeImportsRequestArgs, Proto.OrganizeImportsResponse]
  'projectInfo': [Proto.ProjectInfoRequestArgs, Proto.ProjectInfoResponse]
  'quickinfo': [Proto.FileLocationRequestArgs, Proto.QuickInfoResponse]
  'references': [Proto.FileLocationRequestArgs, Proto.ReferencesResponse]
  'rename': [Proto.RenameRequestArgs, Proto.RenameResponse]
  'selectionRange': [Proto.SelectionRangeRequestArgs, Proto.SelectionRangeResponse]
  'signatureHelp': [Proto.SignatureHelpRequestArgs, Proto.SignatureHelpResponse]
  'typeDefinition': [Proto.FileLocationRequestArgs, Proto.TypeDefinitionResponse]
}

export interface ITypeScriptServiceClient {
  apiVersion: API
  configuration: TypeScriptServiceConfiguration
  onTsServerStarted: Event<API>
  onProjectLanguageServiceStateChanged: Event<Proto.ProjectLanguageServiceStateEventBody>
  onDidBeginInstallTypings: Event<Proto.BeginInstallTypesEventBody>
  onDidEndInstallTypings: Event<Proto.EndInstallTypesEventBody>
  onTypesInstallerInitializationFailed: Event<Proto.TypesInstallerInitializationFailedEventBody>
  readonly logger: Logger

  getProjectRootPath(uri: string): string | null
  normalizePath(resource: Uri): string | null
  asUrl(filepath: string): Uri
  toPath(uri: string): string
  toResource(path: string): string

  execute<K extends keyof TypeScriptRequestTypes>(
    command: K,
    args: TypeScriptRequestTypes[K][0],
    token: CancellationToken,
    lowPriority?: boolean
  ): Promise<ServerResponse.Response<TypeScriptRequestTypes[K][1]>>

  executeWithoutWaitingForResponse(command: 'open', args: Proto.OpenRequestArgs): void
  executeWithoutWaitingForResponse(command: 'close', args: Proto.FileRequestArgs): void
  executeWithoutWaitingForResponse(command: 'change', args: Proto.ChangeRequestArgs): void
  // executeWithoutWaitingForResponse(command: 'updateOpen', args: Proto.UpdateOpenRequestArgs): void
  executeWithoutWaitingForResponse(command: 'compilerOptionsForInferredProjects', args: Proto.SetCompilerOptionsForInferredProjectsArgs): void
  executeWithoutWaitingForResponse(command: 'reloadProjects', args: null): void
  executeWithoutWaitingForResponse(command: 'configurePlugin', args: Proto.ConfigurePluginRequestArguments): void

  executeAsync(command: 'geterr', args: Proto.GeterrRequestArgs, token: CancellationToken): Promise<ServerResponse.Response<Proto.Response>>
}
