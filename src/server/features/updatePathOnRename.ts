import { disposeAll, TextDocument, Uri, window, workspace } from 'coc.nvim'
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken, Disposable, WorkspaceEdit } from 'vscode-languageserver-protocol'
import * as Proto from '../protocol'
import { ITypeScriptServiceClient } from '../typescriptService'
import { Mutex } from '../utils/mutex'
import * as typeConverters from '../utils/typeConverters'
import FileConfigurationManager from './fileConfigurationManager'

function wait(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve()
    }, ms)
  })
}

export default class UpdateImportsOnFileRenameHandler {
  private disposables: Disposable[] = []

  public constructor(
    private readonly client: ITypeScriptServiceClient,
    private readonly fileConfigurationManager: FileConfigurationManager,
    languageId: string
  ) {
    let glob = languageId == 'typescript' ? '**/*.{ts,tsx}' : '**/*.{js,jsx}'
    const watcher = workspace.createFileSystemWatcher(glob)
    this.disposables.push(watcher)
    let mutex = new Mutex()
    watcher.onDidRename(async e => {
      let release = await mutex.acquire()
      try {
        await this.doRename(e.oldUri, e.newUri)
        release()
      } catch (e) {
        this.client.logger.error('Error on rename:', e)
        release()
      }
    }, null, this.disposables)
  }

  public dispose(): void {
    disposeAll(this.disposables)
  }

  private async doRename(
    oldResource: Uri,
    newResource: Uri
  ): Promise<void> {
    if (oldResource.scheme !== 'file' || newResource.scheme !== 'file') {
      return
    }
    const targetFile = newResource.fsPath
    const oldFile = oldResource.fsPath
    const newUri = newResource.toString()
    let oldDocument = workspace.getDocument(oldResource.toString())
    if (oldDocument) {
      await workspace.nvim.command(`silent ${oldDocument.bufnr}bwipeout!`)
    }
    let document = workspace.getDocument(newUri)
    if (document) {
      await workspace.nvim.command(`silent ${document.bufnr}bwipeout!`)
      await wait(30)
    }
    document = await workspace.loadFile(newUri)
    if (!document) return
    await wait(50)
    const edits = await this.getEditsForFileRename(
      document.textDocument,
      oldFile,
      targetFile,
    )
    if (!edits) return
    if (await this.promptUser(newResource)) {
      await workspace.applyEdit(edits)
    }
  }

  private async promptUser(newResource: Uri): Promise<boolean> {
    return await window.showPrompt(`Update imports for moved file: ${newResource.fsPath}?`)
  }

  private async getEditsForFileRename(document: TextDocument, oldFile: string, newFile: string): Promise<WorkspaceEdit> {
    await this.fileConfigurationManager.ensureConfigurationForDocument(document, CancellationToken.None)
    const response = await this.client.interruptGetErr(() => {
      const args: Proto.GetEditsForFileRenameRequestArgs = {
        oldFilePath: oldFile,
        newFilePath: newFile,
      }
      return this.client.execute('getEditsForFileRename', args, CancellationToken.None)
    })
    if (!response || response.type != 'response' || !response.body) {
      return
    }

    const edits: Proto.FileCodeEdits[] = []
    for (const edit of response.body) {
      // Workaround for https://github.com/Microsoft/vscode/issues/52675
      if ((edit as Proto.FileCodeEdits).fileName.match(
        /[\/\\]node_modules[\/\\]/gi
      )) {
        continue
      }
      for (const change of (edit as Proto.FileCodeEdits).textChanges) {
        if (change.newText.match(/\/node_modules\//gi)) {
          continue
        }
      }

      edits.push(edit)
    }
    return typeConverters.WorkspaceEdit.fromFileCodeEdits(this.client, edits)
  }
}
