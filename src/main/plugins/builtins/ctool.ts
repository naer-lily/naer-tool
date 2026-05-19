import { join } from 'path'
import { app } from 'electron'
import type { IPlugin, ICommand, PluginContext, CommandContext } from '@shared/plugin-api'

const getHtmlPath = (): string => {
  return join(app.getAppPath(), 'resources', 'ctool', 'index.html')
}

const getPreloadPath = (): string => {
  return join(app.getAppPath(), 'resources', 'ctool-preload.js')
}

async function openCtool(ctx: CommandContext): Promise<void> {
  const htmlPath = getHtmlPath()
  const preload = getPreloadPath()
  await ctx.openWebView({
    htmlPath,
    preload,
    height: 520
  })
}

const ctoolPlugin: IPlugin = {
  id: 'ctool',
  name: 'CTool',
  icon: '\u{1F6E0}\uFE0F',

  prefix: 'ct',

  async onActivate() {},
  async onDeactivate() {},

  async buildCommands(_ctx: PluginContext, input: string): Promise<ICommand[]> {
    const trimmed = input.trim()
    return [{
      id: 'open',
      name: '打开 CTool',
      icon: '\u{1F6E0}\uFE0F',
      preview: trimmed
        ? `搜索 CTool 工具: ${trimmed}`
        : '哈希/加解密/格式化/二维码/时间戳/UUID/进制转换/正则/JSON...',
      execute: openCtool
    }]
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
