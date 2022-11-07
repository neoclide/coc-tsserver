import { ExtensionContext, services } from 'coc.nvim'
import TsserverService from './server'
import { PluginManager } from './utils/plugins'

interface API {
  configurePlugin(pluginId: string, configuration: {}): void
}

export async function activate(context: ExtensionContext): Promise<API> {
  let { subscriptions } = context
  const pluginManager = new PluginManager()
  const service = new TsserverService(pluginManager, context)
  subscriptions.push(services.regist(service))

  return {
    configurePlugin: (pluginId: string, configuration: {}): void => {
      pluginManager.setConfiguration(pluginId, configuration)
    }
  }
}
