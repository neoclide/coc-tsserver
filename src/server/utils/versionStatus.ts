import { StatusBarItem, workspace, events } from 'coc.nvim'
import { Disposable } from 'vscode-languageserver-protocol'
import Uri from 'vscode-uri'
import { TypeScriptVersion } from './versionProvider'

export default class VersionStatus {
  private readonly _onChangeEditorSub: Disposable
  private readonly _versionBarEntry: StatusBarItem

  constructor(
    private readonly _normalizePath: (resource: Uri) => string | null,
    private readonly enableJavascript: boolean
  ) {
    this._versionBarEntry = workspace.createStatusBarItem(99)
    this._onChangeEditorSub = events.on('BufEnter', this.showHideStatus, this)
    this._versionBarEntry.show()
  }

  public dispose(): void {
    this._versionBarEntry.dispose()
    this._onChangeEditorSub.dispose()
  }

  public onDidChangeTypeScriptVersion(version: TypeScriptVersion): void {
    this._versionBarEntry.text = `TSC ${version.versionString}`
    this.showHideStatus().catch(_e => {
      // noop
    })
  }

  private async showHideStatus(): Promise<void> {
    let document = await workspace.document
    if (!document) {
      this._versionBarEntry.hide()
      return
    }
    let filetypes = ['typescript', 'typescriptreact']
    if (this.enableJavascript) {
      filetypes.push('javascript', 'javascriptreact')
    }

    if (filetypes.indexOf(document.filetype) !== -1) {
      if (this._normalizePath(Uri.parse(document.uri))) {
        this._versionBarEntry.show()
      } else {
        this._versionBarEntry.hide()
      }
      return
    }
    this._versionBarEntry.hide()
  }
}
