/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken, Disposable, disposeAll, MessageItem, RelativePattern, TextDocument, Uri, window, workspace, WorkspaceEdit } from 'coc.nvim'
import fs from 'fs'
import path from 'path'
import { promisify } from 'util'
import * as Proto from '../protocol'
import { ClientCapability, ITypeScriptServiceClient } from '../typescriptService'
import API from '../utils/api'
import { Delayer } from '../utils/async'
import { doesResourceLookLikeATypeScriptFile } from '../utils/languageDescription'
import * as typeConverters from '../utils/typeConverters'
import FileConfigurationManager from './fileConfigurationManager'

async function isDirectory(resource: Uri): Promise<boolean> {
  try {
    return (await promisify(fs.stat)(resource.fsPath)).isDirectory()
  } catch {
    return false
  }
}

const nulToken = CancellationToken.None
const enum UpdateImportsOnFileMoveSetting {
  Prompt = 'prompt',
  Always = 'always',
  Never = 'never',
}

const updateImportsOnFileMoveName = 'updateImportsOnFileMove.enabled'

interface RenameAction {
  readonly oldUri: Uri
  readonly newUri: Uri
  readonly newFilePath: string
  readonly oldFilePath: string
  readonly jsTsFileThatIsBeingMoved: Uri
}

export default class UpdateImportsOnFileRenameHandler {
  private disposables: Disposable[] = []
  private readonly _delayer = new Delayer(1000);
  private readonly _pendingRenames = new Set<RenameAction>();

  public constructor(
    private readonly client: ITypeScriptServiceClient,
    private readonly fileConfigurationManager: FileConfigurationManager,
    private readonly _handles: (uri: string) => Promise<boolean>,
  ) {
    let glob = '**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'
    const watcher = workspace.createFileSystemWatcher(glob)
    this.disposables.push(watcher)
    watcher.onDidRename(async e => {
      let { oldUri, newUri } = e
      const newFilePath = this.client.toPath(newUri.toString())
      if (!newFilePath) {
        return
      }
      const oldFilePath = this.client.toPath(oldUri.toString())
      if (!oldFilePath) {
        return
      }

      const config = this.getConfiguration(newUri)
      const setting = config.get<UpdateImportsOnFileMoveSetting>(updateImportsOnFileMoveName)
      if (setting === UpdateImportsOnFileMoveSetting.Never) {
        return
      }

      // Try to get a js/ts file that is being moved
      // For directory moves, this returns a js/ts file under the directory.
      const jsTsFileThatIsBeingMoved = await this.getJsTsFileBeingMoved(newUri)
      if (!jsTsFileThatIsBeingMoved || !this.client.toPath(jsTsFileThatIsBeingMoved.toString())) {
        return
      }

      this._pendingRenames.add({ oldUri, newUri, newFilePath, oldFilePath, jsTsFileThatIsBeingMoved })

      this._delayer.trigger(() => {
        window.withProgress({
          title: 'Checking for update of JS/TS imports'
        }, () => this.flushRenames())
      })
    })
  }

  public dispose(): void {
    this._delayer.cancelTimeout()
    disposeAll(this.disposables)
  }

  private getConfiguration(resource: Uri) {
    return workspace.getConfiguration(doesResourceLookLikeATypeScriptFile(resource) ? 'typescript' : 'javascript', resource)
  }

  private async flushRenames(): Promise<void> {
    const renames = Array.from(this._pendingRenames)
    this._pendingRenames.clear()
    for (const group of this.groupRenames(renames)) {
      const edits: WorkspaceEdit = {}
      const resourcesBeingRenamed: Uri[] = []

      for (const { oldUri, newUri, newFilePath, oldFilePath, jsTsFileThatIsBeingMoved } of group) {
        const document = await workspace.openTextDocument(jsTsFileThatIsBeingMoved)
        // Make sure TS knows about file
        this.client.bufferSyncSupport.closeResource(oldUri.toString())
        this.client.bufferSyncSupport.openTextDocument(document.textDocument)

        if (await this.withEditsForFileRename(edits, document.textDocument, oldFilePath, newFilePath)) {
          resourcesBeingRenamed.push(newUri)
        }
      }

      if (Object.keys(edits.changes ?? {}).length > 0) {
        if (await this.confirmActionWithUser(resourcesBeingRenamed)) {
          await workspace.applyEdit(edits)
        }
      }
    }
  }

  private async confirmActionWithUser(newResources: readonly Uri[]): Promise<boolean> {
    if (!newResources.length) return false
    const config = this.getConfiguration(newResources[0])
    const setting = config.get<UpdateImportsOnFileMoveSetting>(updateImportsOnFileMoveName)
    switch (setting) {
      case UpdateImportsOnFileMoveSetting.Always:
        return true
      case UpdateImportsOnFileMoveSetting.Never:
        return false
      case UpdateImportsOnFileMoveSetting.Prompt:
      default:
        return this.promptUser(newResources)
    }
  }

  private async promptUser(newResources: readonly Uri[]): Promise<boolean> {
    if (!newResources.length) return false
    const rejectItem: MessageItem = {
      title: "No",
      isCloseAffordance: true,
    }

    const acceptItem: MessageItem = {
      title: "Yes"
    }
    const response = await window.showInformationMessage(
      newResources.length === 1
        ? `Update imports for '${path.basename(newResources[0].fsPath)}'?`
        : this.getConfirmMessage(`Update imports for the following ${newResources.length} files?`, newResources),
      rejectItem, acceptItem)
    switch (response) {
      case acceptItem: {
        return true
      }
      case rejectItem: {
        return false
      }
      default: {
        return false
      }
    }
  }

  private async getJsTsFileBeingMoved(resource: Uri): Promise<Uri | undefined> {
    if (resource.scheme !== 'file') {
      return undefined
    }

    if (await isDirectory(resource)) {
      const files = await workspace.findFiles(new RelativePattern(resource, '**/*.{ts,tsx,js,jsx}'), '**/node_modules/**', 1)
      return files[0]
    }

    return (await this._handles(resource.toString())) ? resource : undefined
  }

  private async withEditsForFileRename(
    edits: WorkspaceEdit,
    document: TextDocument,
    oldFilePath: string,
    newFilePath: string,
  ): Promise<boolean> {
    const response = await this.client.interruptGetErr(() => {
      this.fileConfigurationManager.setGlobalConfigurationFromDocument(document, nulToken)
      const args: Proto.GetEditsForFileRenameRequestArgs = {
        oldFilePath,
        newFilePath,
      }
      return this.client.execute('getEditsForFileRename', args, nulToken)
    })
    if (response.type !== 'response' || !response.body.length) {
      return false
    }

    typeConverters.WorkspaceEdit.withFileCodeEdits(edits, this.client, response.body)
    return true
  }

  private groupRenames(renames: Iterable<RenameAction>): Iterable<Iterable<RenameAction>> {
    const groups = new Map<string, Set<RenameAction>>()
    for (const rename of renames) {
      // Group renames by type (js/ts) and by workspace.
      const key = `${this.client.getWorkspaceRootForResource(rename.jsTsFileThatIsBeingMoved)}@@@${doesResourceLookLikeATypeScriptFile(rename.jsTsFileThatIsBeingMoved)}`
      if (!groups.has(key)) {
        groups.set(key, new Set())
      }
      groups.get(key)!.add(rename)
    }

    return groups.values()
  }

  private getConfirmMessage(start: string, resourcesToConfirm: readonly Uri[]): string {
    const MAX_CONFIRM_FILES = 10

    const paths = [start]
    paths.push('')
    paths.push(...resourcesToConfirm.slice(0, MAX_CONFIRM_FILES).map(r => path.basename(r.fsPath)))

    if (resourcesToConfirm.length > MAX_CONFIRM_FILES) {
      if (resourcesToConfirm.length - MAX_CONFIRM_FILES === 1) {
        paths.push("...1 additional file not shown")
      } else {
        paths.push(`...${resourcesToConfirm.length - MAX_CONFIRM_FILES} additional files not shown`)
      }
    }

    paths.push('')
    return paths.join('\n')
  }
}

export function register(
  client: ITypeScriptServiceClient,
  fileConfigurationManager: FileConfigurationManager,
  handles: (uri: string) => Promise<boolean>,
) {
  if (client.apiVersion.gte(API.v300) && client.capabilities.has(ClientCapability.Semantic)) {
    return new UpdateImportsOnFileRenameHandler(client, fileConfigurationManager, handles)
  }
}
