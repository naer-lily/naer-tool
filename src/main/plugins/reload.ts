import type { IPlugin, CommandMatch, CommandContext, CommandResult } from '../../shared/plugin-api'
import { pluginHost } from '../plugin-host'
import { prefixRegistry } from '../prefix-registry'

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
        return input === 'reload' || input === '重载'
      },
      build() {
        return {
          id: 'reload-plugins',
          name: '重载插件',
          icon: '\u{1F504}',
          match(): CommandMatch {
            return { preview: '重新加载所有插件', priority: 5 }
          },
          async execute(_ctx: CommandContext): Promise<CommandResult> {
            try {
              pluginHost.reloadAll()
              prefixRegistry.rebuild()
              return { type: 'toast', message: '插件已重载' }
            } catch (e) {
              return { type: 'toast', message: `重载失败: ${String(e).slice(0, 80)}` }
            }
          }
        }
      }
    }]
  }
}

export default reloadPlugin
