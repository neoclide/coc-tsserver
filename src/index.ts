import { commands, ExtensionContext, services, workspace } from 'coc.nvim'
import TsserverService from './server'
import { AutoFixCommand, Command, ConfigurePluginCommand, FileReferencesCommand, OpenTsServerLogCommand, ReloadProjectsCommand, TypeScriptGoToProjectConfigCommand } from './server/commands'
import { OrganizeImportsCommand, SourceImportsCommand } from './server/organizeImports'
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
  registCommand(new FileReferencesCommand(service))
  registCommand(new OpenTsServerLogCommand(service))
  registCommand(new TypeScriptGoToProjectConfigCommand(service))
  registCommand(new OrganizeImportsCommand(service))
  registCommand(new SourceImportsCommand(service))
  registCommand({
    id: 'tsserver.restart',
    execute: (): void => {
      service.restart()
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
