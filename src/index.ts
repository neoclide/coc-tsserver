import { services, commands, languages, ExtensionContext, workspace, TextDocumentWillSaveEvent, ServiceStat } from 'coc.nvim'
import TsserverService from './server'
import { languageIds } from './server/utils/languageModeIds'
import { OpenTsServerLogCommand, ReloadProjectsCommand, TypeScriptGoToProjectConfigCommand } from './server/commands'
import { TextEdit } from 'vscode-languageserver-types'
import { Command } from './server/commands'

export async function activate(context: ExtensionContext): Promise<void> {
  let { subscriptions } = context
  const config = workspace.getConfiguration().get('tsserver', {}) as any
  if (!config.enable) return
  const service = new TsserverService()

  subscriptions.push(
    (services as any).regist(service)
  )

  function onWillSave(event: TextDocumentWillSaveEvent): void {
    if (service.state != ServiceStat.Running) return
    let config = service.config
    let formatOnSave = config.get<boolean>('formatOnSave')
    if (!formatOnSave) return
    let { languageId } = event.document
    if (languageIds.indexOf(languageId) == -1) return
    let willSaveWaitUntil = async (): Promise<TextEdit[]> => {
      let options = await workspace.getFormatOptions(event.document.uri)
      let textEdits = await languages.provideDocumentFormattingEdits(event.document, options)
      return textEdits
    }
    event.waitUntil(willSaveWaitUntil())
  }

  function registCommand(cmd: Command): void {
    let { id, execute } = cmd
    subscriptions.push(commands.registerCommand(id as string, execute, cmd))
  }

  registCommand(new ReloadProjectsCommand(service.clientHost))
  registCommand(new OpenTsServerLogCommand(service.clientHost))
  registCommand(new TypeScriptGoToProjectConfigCommand(service.clientHost))
  registCommand(commands.register({
    id: 'tsserver.restart',
    execute: (): void => {
      service.stop().then(() => {
        setTimeout(() => {
          service.restart()
        }, 100)
      })
    }
  }))

  subscriptions.push(
    workspace.onWillSaveUntil(onWillSave, null, 'tsserver')
  )
}
