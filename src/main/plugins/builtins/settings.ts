import type { IPlugin, ICommand, PluginContext, CommandContext } from '@shared/plugin-api'
import { app } from 'electron'
import { join } from 'path'
import { configManager } from '@main/config'

async function openSettings(ctx: CommandContext): Promise<void> {
  const htmlPath = join(app.getAppPath(), 'resources', 'settings.html')
  const cfg = configManager.getRaw()
  const hash = encodeURIComponent(JSON.stringify({ shortcut: cfg.shortcut || 'Alt+Space', theme: cfg.theme || 'dark', launchAtStartup: cfg.launchAtStartup || false }))
  const url = `file:///${htmlPath.replace(/\\/g, '/')}#${hash}`

  const result = await ctx.openWebView({
    url,
    height: 360,
    injectBaseStyles: true
  })

  if (!result || typeof result !== 'object') {
    return
  }

  const data = result as Record<string, unknown>
  const shortcut = String(data.shortcut || '').trim()
  const theme = (data.theme as 'light' | 'dark') || 'dark'
  const launchAtStartup = Boolean(data.launchAtStartup)

  if (!shortcut) return

  configManager.patch({ shortcut, theme, launchAtStartup })
  ctx.toast('Settings saved. Restart Futari to apply shortcut changes.')
}

const settingsPlugin: IPlugin = {
  id: 'settings',
  name: 'Settings',
  icon: '\u2699\uFE0F',

  async onActivate() {},
  async onDeactivate() {},

  async buildCommands(_ctx: PluginContext, _input: string): Promise<ICommand[]> {
    return []
  },

  async getFallbackCommands(_ctx: PluginContext, input: string): Promise<ICommand[]> {
    if (input) {
      const t = input.toLowerCase()
      const match = 'settings'.startsWith(t) || 'config'.startsWith(t) || 'options'.startsWith(t) || 'preferences'.startsWith(t)
      if (!match) return []
    }
    return [{
      id: 'settings',
      name: 'Settings',
      icon: '\u2699\uFE0F',
      preview: 'Open settings — configure shortcut, theme and preferences',
      async execute(ctx: CommandContext): Promise<void> {
        await openSettings(ctx)
      }
    }]
  }
}

export default settingsPlugin
