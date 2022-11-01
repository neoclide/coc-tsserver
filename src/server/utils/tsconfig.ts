/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path'
import type * as Proto from '../protocol'
import { CancellationToken, snippetManager, window, workspace, Uri, MessageItem } from 'coc.nvim'
import { ITypeScriptServiceClient, ServerResponse } from '../typescriptService'
import { TypeScriptServiceConfiguration } from './configuration'

export const enum ProjectType {
  TypeScript,
  JavaScript,
}

export function isImplicitProjectConfigFile(configFileName: string) {
  return configFileName.startsWith('/dev/null/')
}

const defaultProjectConfig = Object.freeze<Proto.ExternalProjectCompilerOptions>({
  module: 'ESNext' as Proto.ModuleKind,
  moduleResolution: 'Node' as Proto.ModuleResolutionKind,
  target: 'ES2020' as Proto.ScriptTarget,
  jsx: 'react' as Proto.JsxEmit,
})

export function inferredProjectCompilerOptions(
  projectType: ProjectType,
  serviceConfig: TypeScriptServiceConfiguration,
): Proto.ExternalProjectCompilerOptions {
  const projectConfig = { ...defaultProjectConfig }

  if (serviceConfig.implicitProjectConfiguration.checkJs) {
    projectConfig.checkJs = true
    if (projectType === ProjectType.TypeScript) {
      projectConfig.allowJs = true
    }
  }

  if (serviceConfig.implicitProjectConfiguration.experimentalDecorators) {
    projectConfig.experimentalDecorators = true
  }

  if (serviceConfig.implicitProjectConfiguration.strictNullChecks) {
    projectConfig.strictNullChecks = true
  }

  if (serviceConfig.implicitProjectConfiguration.strictFunctionTypes) {
    projectConfig.strictFunctionTypes = true
  }


  if (serviceConfig.implicitProjectConfiguration.module) {
    projectConfig.module = serviceConfig.implicitProjectConfiguration.module as Proto.ModuleKind
  }

  if (serviceConfig.implicitProjectConfiguration.target) {
    projectConfig.target = serviceConfig.implicitProjectConfiguration.target as Proto.ScriptTarget
  }

  if (projectType === ProjectType.TypeScript) {
    projectConfig.sourceMap = true
  }

  return projectConfig
}

function inferredProjectConfigSnippet(
  projectType: ProjectType,
  config: TypeScriptServiceConfiguration
): string {
  const baseConfig = inferredProjectCompilerOptions(projectType, config)
  const compilerOptions = Object.keys(baseConfig).map(key => `"${key}": ${JSON.stringify(baseConfig[key])}`)
  return `{
	"compilerOptions": {
		${compilerOptions.join(',\n\t\t')}$0
	},
	"exclude": [
		"node_modules",
		"**/node_modules/*"
	]
}`
}

export async function openOrCreateConfig(
  projectType: ProjectType,
  rootPath: string,
  configuration: TypeScriptServiceConfiguration,
): Promise<void> {
  const configFile = Uri.file(path.join(rootPath, projectType === ProjectType.TypeScript ? 'tsconfig.json' : 'jsconfig.json'))
  try {
    let doc = await workspace.openTextDocument(configFile)
    await workspace.openResource(doc.uri)
    let text = doc.textDocument.getText()
    if (text.length === 0) {
      await workspace.nvim.command('startinsert')
      await snippetManager.insertSnippet(inferredProjectConfigSnippet(projectType, configuration))
    }
  } catch {
  }
}

export async function openProjectConfigOrPromptToCreate(
  projectType: ProjectType,
  client: ITypeScriptServiceClient,
  rootPath: string,
  configFileName: string,
): Promise<void> {
  if (!isImplicitProjectConfigFile(configFileName)) {
    await workspace.openTextDocument(configFileName)
    return
  }

  const CreateConfigItem: MessageItem = {
    title: projectType === ProjectType.TypeScript
      ? 'Configure tsconfig.json'
      : 'Configure jsconfig.json',
  }

  const selected = await window.showInformationMessage(
    (projectType === ProjectType.TypeScript
      ? 'File is not part of a TypeScript project. View the https://go.microsoft.com/fwlink/?linkid=841896 to learn more.'
      : 'File is not part of a JavaScript project. View the https://go.microsoft.com/fwlink/?linkid=759670 to learn more.'
    ),
    CreateConfigItem)

  switch (selected) {
    case CreateConfigItem:
      openOrCreateConfig(projectType, rootPath, client.configuration)
      return
  }
}

export async function openProjectConfigForFile(
  projectType: ProjectType,
  client: ITypeScriptServiceClient,
  resource: Uri,
): Promise<void> {
  const rootPath = client.getWorkspaceRootForResource(resource)
  if (!rootPath) {
    window.showInformationMessage('Please open a folder in VS Code to use a TypeScript or JavaScript project')
    return
  }

  const file = client.toPath(resource.toString())
  // TSServer errors when 'projectInfo' is invoked on a non js/ts file
  if (!file || !await client.toPath(resource.toString())) {
    window.showWarningMessage('Could not determine TypeScript or JavaScript project. Unsupported file type')
    return
  }

  let res: ServerResponse.Response<Proto.ProjectInfoResponse> | undefined
  try {
    res = await client.execute('projectInfo', { file, needFileNameList: false }, CancellationToken.None)
  } catch {
    // noop
  }

  if (res?.type !== 'response' || !res.body) {
    window.showWarningMessage('Could not determine TypeScript or JavaScript project')
    return
  }
  return openProjectConfigOrPromptToCreate(projectType, client, rootPath, res.body.configFileName)
}
