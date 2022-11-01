/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'path'
import { workspace, Uri } from 'coc.nvim'

export class RelativeWorkspacePathResolver {
  public static asAbsoluteWorkspacePath(relativePath: string): string | undefined {
    for (const root of workspace.workspaceFolders || []) {
      const rootPrefixes = [`./${root.name}/`, `${root.name}/`, `.\\${root.name}\\`, `${root.name}\\`]
      for (const rootPrefix of rootPrefixes) {
        if (relativePath.startsWith(rootPrefix)) {
          return path.join(Uri.parse(root.uri).fsPath, relativePath.replace(rootPrefix, ''))
        }
      }
    }

    return undefined
  }
}
