import { commands, ExtensionContext, services, workspace } from 'coc.nvim'
import TsserverService from './server'
import { AutoFixCommand, Command, ConfigurePluginCommand, OpenTsServerLogCommand, ReloadProjectsCommand, TypeScriptGoToProjectConfigCommand } from './server/commands'
import OrganizeImportsCommand from './server/organizeImports'
import { PluginManager } from './utils/plugins'

interface API {
  configurePlugin(pluginId: string, configuration: {}): void
}

export async function activate(context: ExtensionContext): Promise<API> {
  let { subscriptions } = context
  const config = workspace.getConfiguration().get<any>('tsserver', {})
  if (!config.enable) return
  const pluginManager = new PluginManager()
  const service = new TsserverService(pluginManager)

  subscriptions.push(
    (services as any).regist(service)
  )

  await service.start()

  function registCommand(cmd: Command): void {
    let { id, execute } = cmd
    subscriptions.push(commands.registerCommand(id as string, execute, cmd))
  }

  registCommand(new AutoFixCommand(service.clientHost))
  registCommand(new ReloadProjectsCommand(service.clientHost))
  registCommand(new OpenTsServerLogCommand(service.clientHost))
  registCommand(new TypeScriptGoToProjectConfigCommand(service.clientHost))
  registCommand(new OrganizeImportsCommand(service.clientHost))
  registCommand(new ConfigurePluginCommand(pluginManager))
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
  return {
    configurePlugin: (pluginId: string, configuration: {}): void => {
      pluginManager.setConfiguration(pluginId, configuration)
    }
  }
}
