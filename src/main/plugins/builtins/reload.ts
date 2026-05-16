import type { IPlugin, CommandMatch, CommandContext } from '@shared/plugin-api'
import { pluginHost } from '@main/plugin-host'
import { prefixRegistry } from '@main/prefix-registry'

const reloadPlugin: IPlugin = {
  id: 'reload',
  name: '重载插件',
  icon: '\u{1F504}',

  async onActivate() {},
  async onDeactivate() {},

  async buildCommands() {
    return []
  },

  async getFallbackCommands() {
    return [{
      id: 'reload-plugins',
      name: '重载插件',
      description: '重新加载所有插件',
      icon: '\u{1F504}',
      matches(input: string): boolean {
        return !input || input === 'reload' || input === '重载' || 'reload'.startsWith(input) || '重载'.startsWith(input)
      },
      build() {
        return {
          id: 'reload-plugins',
          name: '重载插件',
          icon: '\u{1F504}',
          match(): CommandMatch {
            return { preview: '重新加载所有插件', priority: 5 }
          },
          execute(ctx: CommandContext): void {
            try {
              pluginHost.reloadAll()
              prefixRegistry.rebuild()
              ctx.toast('插件已重载')
            } catch (e) {
              ctx.toast(`重载失败: ${String(e).slice(0, 80)}`)
            }
          }
        }
      }
    }]
  }
}

export default reloadPlugin
