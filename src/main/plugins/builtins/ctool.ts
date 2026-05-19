import { join } from 'path'
import { app } from 'electron'
import type { IPlugin, ICommand, PluginContext, CommandContext } from '@shared/plugin-api'

const getHtmlPath = (): string => {
  return join(app.getAppPath(), 'resources', 'ctool', 'index.html')
}

async function openCtool(ctx: CommandContext): Promise<void> {
  const htmlPath = getHtmlPath()
  await ctx.openWebView({
    htmlPath,
    height: 520
  })
}

const ctoolPlugin: IPlugin = {
  id: 'ctool',
  name: 'CTool',
  icon: '\u{1F6E0}\uFE0F',

  prefix: '',

  async onActivate() {},
  async onDeactivate() {},

  async buildCommands(_ctx: PluginContext, _input: string): Promise<ICommand[]> {
    return []
  },

  async getFallbackCommands(_ctx: PluginContext, input: string): Promise<ICommand[]> {
    if (input && !'ctool'.startsWith(input.toLowerCase())) {
      return []
    }
    return [{
      id: 'open-from-home',
      name: 'CTool 开发工具',
      icon: '\u{1F6E0}\uFE0F',
      preview: '哈希/加解密/格式化/二维码/时间戳/UUID/进制转换/正则/JSON...',
      execute: openCtool
    }]
  }
}

export default ctoolPlugin
