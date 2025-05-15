/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken, Event, Uri } from 'coc.nvim'
import { PluginManager } from '../utils/plugins'
import BufferSyncSupport from './features/bufferSyncSupport'
import * as Proto from './protocol'
import API from './utils/api'
import { TypeScriptServiceConfiguration } from './utils/configuration'
import Logger from './utils/logger'

export enum ServerType {
  Syntax = 'syntax',
  Semantic = 'semantic',
}

export enum ExecutionTarget {
  Semantic,
  Syntax
}

export namespace ServerResponse {

  export class Cancelled {
    public readonly type = 'cancelled';

    constructor(
      public readonly reason: string
    ) {}
  }

  export const NoContent = { type: 'noContent' } as const

  export const NoServer = { type: 'noServer' } as const

  export type Response<T extends Proto.Response> = T | Cancelled | typeof NoContent | typeof NoServer
}

interface StandardTsServerRequests {
  'applyCodeActionCommand': [Proto.ApplyCodeActionCommandRequestArgs, Proto.ApplyCodeActionCommandResponse]
  'completionEntryDetails': [Proto.CompletionDetailsRequestArgs, Proto.CompletionDetailsResponse]
  'completionInfo': [Proto.CompletionsRequestArgs, Proto.CompletionInfoResponse]
  'completions': [Proto.CompletionsRequestArgs, Proto.CompletionsResponse]
  'configure': [Proto.ConfigureRequestArguments, Proto.ConfigureResponse]
  'definition': [Proto.FileLocationRequestArgs, Proto.DefinitionResponse]
  'definitionAndBoundSpan': [Proto.FileLocationRequestArgs, Proto.DefinitionInfoAndBoundSpanResponse]
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
  'linkedEditingRange': [Proto.FileLocationRequestArgs, Proto.LinkedEditingRangeResponse];
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
  'updateOpen': [Proto.UpdateOpenRequestArgs, Proto.Response]
  'prepareCallHierarchy': [Proto.FileLocationRequestArgs, Proto.PrepareCallHierarchyResponse]
  'provideCallHierarchyIncomingCalls': [Proto.FileLocationRequestArgs, Proto.ProvideCallHierarchyIncomingCallsResponse]
  'provideCallHierarchyOutgoingCalls': [Proto.FileLocationRequestArgs, Proto.ProvideCallHierarchyOutgoingCallsResponse]
  'fileReferences': [Proto.FileRequestArgs, Proto.FileReferencesResponse]
  'provideInlayHints': [Proto.InlayHintsRequestArgs, Proto.InlayHintsResponse]
  'encodedSemanticClassifications-full': [Proto.EncodedSemanticClassificationsRequestArgs, Proto.EncodedSemanticClassificationsResponse]
  'findSourceDefinition': [Proto.FileLocationRequestArgs, Proto.DefinitionResponse]
  'getMoveToRefactoringFileSuggestions': [Proto.GetMoveToRefactoringFileSuggestionsRequestArgs, Proto.GetMoveToRefactoringFileSuggestions]
}

interface NoResponseTsServerRequests {
  'open': [Proto.OpenRequestArgs, null]
  'close': [Proto.FileRequestArgs, null]
  'change': [Proto.ChangeRequestArgs, null]
  'compilerOptionsForInferredProjects': [Proto.SetCompilerOptionsForInferredProjectsArgs, null]
  'reloadProjects': [null, null]
  'configurePlugin': [Proto.ConfigurePluginRequest, Proto.ConfigurePluginResponse]
}

interface AsyncTsServerRequests {
  'geterr': [Proto.GeterrRequestArgs, Proto.Response]
  'geterrForProject': [Proto.GeterrForProjectRequestArgs, Proto.Response]
}

export type TypeScriptRequests = StandardTsServerRequests & NoResponseTsServerRequests & AsyncTsServerRequests

export type ExecConfig = {
  readonly lowPriority?: boolean
  readonly nonRecoverable?: boolean
  readonly cancelOnResourceChange?: string
  readonly executionTarget?: ExecutionTarget
}

export enum ClientCapability {
  /**
   * Basic syntax server. All clients should support this.
   */
  Syntax,

  /**
   * Advanced syntax server that can provide single file IntelliSense.
   */
  EnhancedSyntax,

  /**
   * Complete, multi-file semantic server
   */
  Semantic,
}

export class ClientCapabilities {
  private readonly capabilities: ReadonlySet<ClientCapability>

  constructor(...capabilities: ClientCapability[]) {
    this.capabilities = new Set(capabilities)
  }

  public has(capability: ClientCapability): boolean {
    return this.capabilities.has(capability)
  }
}

export interface ITypeScriptServiceClient {
  /**
   * Convert a resource (VS Code) to a normalized path (TypeScript).
   *
   * Does not try handling case insensitivity.
   */
  toTsFilePath(resource: Uri): string | undefined
  /**
   * Map a resource to a normalized path
   *
   * This will attempt to handle case insensitivity.
   */
  toPath(resource: string): string | undefined

  updateGlobalState(key: string, value: any): Promise<void>
  getGlobalState<T>(key: string): T | undefined
  /**
   * Convert a path to a resource.
   */
  toResource(filepath: string): string

  /**
   * Tries to ensure that a vscode document is open on the TS server.
   *
   * @return The normalized path or `undefined` if the document is not open on the server.
   */
  toOpenedFilePath(uri: string, options?: {
    suppressAlertOnFailure?: boolean
  }): string | undefined

  /**
   * Checks if `resource` has a given capability.
   */
  hasCapabilityForResource(resource: Uri, capability: ClientCapability): boolean

  getWorkspaceRootForResource(resource: Uri): string | undefined

  readonly logger: Logger
  readonly onTsServerStarted: Event<API>
  readonly onProjectLanguageServiceStateChanged: Event<Proto.ProjectLanguageServiceStateEventBody>
  readonly onDidBeginInstallTypings: Event<Proto.BeginInstallTypesEventBody>
  readonly onDidEndInstallTypings: Event<Proto.EndInstallTypesEventBody>
  readonly onTypesInstallerInitializationFailed: Event<Proto.TypesInstallerInitializationFailedEventBody>

  readonly capabilities: ClientCapabilities
  readonly onDidChangeCapabilities: Event<void>

  onReady(f: () => void): Promise<void>

  readonly apiVersion: API

  readonly pluginManager: PluginManager
  readonly configuration: TypeScriptServiceConfiguration
  readonly bufferSyncSupport: BufferSyncSupport
  // readonly telemetryReporter: TelemetryReporter

  execute<K extends keyof StandardTsServerRequests>(
    command: K,
    args: StandardTsServerRequests[K][0],
    token: CancellationToken,
    config?: ExecConfig
  ): Promise<ServerResponse.Response<StandardTsServerRequests[K][1]>>

  executeWithoutWaitingForResponse<K extends keyof NoResponseTsServerRequests>(
    command: K,
    args: NoResponseTsServerRequests[K][0]
  ): void

  executeAsync<K extends keyof AsyncTsServerRequests>(
    command: K,
    args: AsyncTsServerRequests[K][0],
    token: CancellationToken
  ): Promise<ServerResponse.Response<Proto.Response>>

  /**
   * Cancel on going geterr requests and re-queue them after `f` has been evaluated.
   */
  interruptGetErr<R>(f: () => R): R
}
