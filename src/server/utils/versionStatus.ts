import { Uri, StatusBarItem, workspace, events } from 'coc.nvim'
import { Disposable } from 'vscode-languageserver-protocol'
import { TypeScriptVersion } from './versionProvider'

export default class VersionStatus {
  private readonly _onChangeEditorSub: Disposable
  private readonly _versionBarEntry: StatusBarItem

  constructor(
    private readonly _normalizePath: (resource: Uri) => string | null,
    private readonly enableJavascript: boolean
  ) {
    this._versionBarEntry = workspace.createStatusBarItem(99)
    this._onChangeEditorSub = events.on('BufEnter', this.onBufEnter, this)
    this._versionBarEntry.show()
  }

  public dispose(): void {
    this._versionBarEntry.dispose()
    this._onChangeEditorSub.dispose()
  }

  public onDidChangeTypeScriptVersion(_version: TypeScriptVersion): void {
    this._versionBarEntry.text = `TSC`
  }

  public set loading(isLoading: boolean) {
    this._versionBarEntry.isProgress = isLoading
  }

  private checkFiletype(filetype: string): boolean {
    if (filetype.startsWith('javascript') && this.enableJavascript) {
      return true
    }
    return filetype.startsWith('typescript')
  }

  private async onBufEnter(bufnr: number): Promise<void> {
    let filetype = await workspace.nvim.call('getbufvar', [bufnr, '&filetype', ''])
    if (this.checkFiletype(filetype)) {
      this._versionBarEntry.show()
    } else {
      this._versionBarEntry.hide()
    }
  }
}
