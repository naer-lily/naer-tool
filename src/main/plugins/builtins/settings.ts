import type { IPlugin, CommandMatch, CommandContext } from '@shared/plugin-api'
import { app } from 'electron'
import { join } from 'path'
import { configManager } from '@main/config'

async function openSettings(ctx: CommandContext): Promise<void> {
  const htmlPath = join(app.getAppPath(), 'resources', 'settings.html')
  const cfg = configManager.getRaw()
  const hash = encodeURIComponent(JSON.stringify({ shortcut: cfg.shortcut || 'Alt+Space', theme: cfg.theme || 'dark' }))
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

  if (!shortcut) return

  configManager.patch({ shortcut, theme })
  ctx.toast('Settings saved. Restart Futari to apply shortcut changes.')
}

const settingsPlugin: IPlugin = {
  id: 'settings',
  name: 'Settings',
  icon: '\u2699\uFE0F',

  async onActivate() {},
  async onDeactivate() {},

  async buildCommands() {
    return []
  },

  async getFallbackCommands() {
    return [{
      id: 'settings',
      name: 'Settings',
      description: 'Configure shortcut, theme and other preferences',
      icon: '\u2699\uFE0F',
      matches(input: string): boolean {
        if (!input) return true
        const t = input.toLowerCase()
        return 'settings'.startsWith(t) || 'config'.startsWith(t) || 'options'.startsWith(t) || 'preferences'.startsWith(t)
      },
      build(_input: string) {
        return {
          id: 'settings',
          name: 'Settings',
          icon: '\u2699\uFE0F',
          match(): CommandMatch {
            return { preview: 'Open settings — configure shortcut, theme and preferences', priority: 10 }
          },
          async execute(ctx: CommandContext): Promise<void> {
            await openSettings(ctx)
          }
        }
      }
    }]
  }
}

export default settingsPlugin
