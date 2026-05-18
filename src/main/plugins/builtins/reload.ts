import type { IPlugin, CommandMatch, CommandContext } from '@shared/plugin-api'
import { pluginHost } from '@main/plugin-host'
import { prefixRegistry } from '@main/prefix-registry'

const reloadPlugin: IPlugin = {
  id: 'reload',
  name: 'Reload Plugins',
  icon: '\u{1F504}',

  async onActivate() {},
  async onDeactivate() {},

  async buildCommands() {
    return []
  },

  async getFallbackCommands() {
    return [{
      id: 'reload-plugins',
      name: 'Reload Plugins',
      description: 'Rescan ~/.futari/plugins/ and reload all',
      icon: '\u{1F504}',
      matches(input: string): boolean {
        return !input || input === 'reload' || 'reload'.startsWith(input.toLowerCase())
      },
      build() {
        return {
          id: 'reload-plugins',
          name: 'Reload Plugins',
          icon: '\u{1F504}',
          match(): CommandMatch {
            return { preview: 'Rescan and reload all user plugins', priority: 5 }
          },
          async execute(ctx: CommandContext): Promise<void> {
            try {
              await pluginHost.scanAndLoadUserPlugins()
              prefixRegistry.rebuild()
              ctx.toast('Plugins reloaded')
            } catch (e) {
              ctx.toast(`Reload failed: ${String(e).slice(0, 80)}`)
            }
          }
        }
      }
    }]
  }
}

export default reloadPlugin
