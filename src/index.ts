import { commands, ExtensionContext, services, workspace } from 'coc.nvim'
import TsserverService from './server'
import { Command, OpenTsServerLogCommand, ReloadProjectsCommand, TypeScriptGoToProjectConfigCommand } from './server/commands'

export async function activate(context: ExtensionContext): Promise<void> {
  let { subscriptions } = context
  const config = workspace.getConfiguration().get<any>('tsserver', {})
  if (!config.enable) return
  const service = new TsserverService()

  subscriptions.push(
    (services as any).regist(service)
  )

  if (!service.clientHost) {
    await service.start()
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
      // tslint:disable-next-line:no-floating-promises
      service.stop().then(() => {
        setTimeout(() => {
          service.restart()
        }, 100)
      })
    }
  }))
}
