import type { IPlugin, ICommand, PluginContext, CommandContext } from '@shared/plugin-api'
import { pluginHost } from '@main/plugin-host'
import { prefixRegistry } from '@main/prefix-registry'

const reloadPlugin: IPlugin = {
  id: 'reload',
  name: 'Reload Plugins',
  icon: '\u{1F504}',

  async onActivate() {},
  async onDeactivate() {},

  async buildCommands(_ctx: PluginContext, _input: string): Promise<ICommand[]> {
    return []
  },

  async getFallbackCommands(_ctx: PluginContext, input: string): Promise<ICommand[]> {
    if (input && !('reload'.startsWith(input.toLowerCase()))) return []
    return [{
      id: 'reload-plugins',
      name: 'Reload Plugins',
      icon: '\u{1F504}',
      preview: 'Rescan and reload all user plugins',
      async execute(ctx: CommandContext): Promise<void> {
        try {
          await pluginHost.scanAndLoadUserPlugins()
          prefixRegistry.rebuild()
          ctx.toast('Plugins reloaded')
        } catch (e) {
          ctx.toast(`Reload failed: ${String(e).slice(0, 80)}`)
        }
      }
    }]
  }
}

export default reloadPlugin
