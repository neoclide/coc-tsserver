import { Disposable, StatusBarItem, TextEditor, window } from 'coc.nvim'
import { TypeScriptVersion } from '../tsServer/versionProvider'

export class VersionStatus {
  private readonly _onChangeEditor: Disposable
  private readonly _versionBarEntry: StatusBarItem
  private _versionString = ''

  constructor() {
    this._versionBarEntry = window.createStatusBarItem(99)
    this._onChangeEditor = window.onDidChangeActiveTextEditor(this.onChangeEditor, this)
    this._versionBarEntry.show()
  }

  public onDidChangeTypeScriptVersion(version: TypeScriptVersion): void {
    this._versionString = version.version.displayName
  }

  public set loading(isLoading: boolean) {
    if (isLoading) {
      this._versionBarEntry.text = `Initializing tsserver ${this._versionString}`
    } else {
      this._versionBarEntry.text = `TSC ${this._versionString}`
    }
    this._versionBarEntry.isProgress = isLoading
  }

  private checkFiletype(filetype: string): boolean {
    return filetype.startsWith('typescript') || filetype.startsWith('javascript')
  }

  private async onChangeEditor(editor: TextEditor): Promise<void> {
    if (this.checkFiletype(editor.document.filetype)) {
      this._versionBarEntry.show()
    } else {
      this._versionBarEntry.hide()
    }
  }

  public dispose(): void {
    this._versionBarEntry.dispose()
    this._onChangeEditor.dispose()
  }
}
