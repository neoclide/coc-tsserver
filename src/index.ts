import { commands, ExtensionContext, services, workspace } from 'coc.nvim'
import TsserverService from './server'
import { AutoFixCommand, Command, ConfigurePluginCommand, OpenTsServerLogCommand, ReloadProjectsCommand, TypeScriptGoToProjectConfigCommand } from './server/commands'
import { OrganizeImportsCommand } from './server/organizeImports'
import { PluginManager } from './utils/plugins'

interface API {
  configurePlugin(pluginId: string, configuration: {}): void
}

export async function activate(context: ExtensionContext): Promise<API> {
  let { subscriptions, logger } = context
  const config = workspace.getConfiguration().get<any>('tsserver', {})
  if (!config.enable) return
  const pluginManager = new PluginManager()
  const service = new TsserverService(pluginManager)
  function registCommand(cmd: Command): void {
    let { id, execute } = cmd
    subscriptions.push(commands.registerCommand(id as string, execute, cmd))
  }
  registCommand(new ConfigurePluginCommand(pluginManager))
  registCommand(new AutoFixCommand(service))
  registCommand(new ReloadProjectsCommand(service))
  registCommand(new OpenTsServerLogCommand(service))
  registCommand(new TypeScriptGoToProjectConfigCommand(service))
  registCommand(new OrganizeImportsCommand(service))
  registCommand({
    id: 'tsserver.restart',
    execute: (): void => {
      // tslint:disable-next-line:no-floating-promises
      service.stop().then(() => {
        setTimeout(() => {
          service.restart()
        }, 100)
      })
    }
  })

  service.start().then(() => {
    subscriptions.push(services.regist(service))
  }, e => {
    logger.error(`Error on service start:`, e)
  })

  return {
    configurePlugin: (pluginId: string, configuration: {}): void => {
      pluginManager.setConfiguration(pluginId, configuration)
    }
  }
}
