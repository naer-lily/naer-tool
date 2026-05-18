import { homedir } from 'os'
import { join } from 'path'
import { exec } from 'child_process'
import type { IPlugin, ICommand, PluginContext, CommandContext } from '@shared/plugin-api'
import { app, shell } from 'electron'
import { configManager } from '@main/config'
import { pluginHost } from '@main/plugin-host'
import { prefixRegistry } from '@main/prefix-registry'

const LOG_PATH = join(homedir(), '.futari', 'logs', 'main.log')

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

function openLogFile(ctx: CommandContext): void {
  const editor = process.env.EDITOR
  if (editor) {
    exec(`"${editor}" "${LOG_PATH}"`, (error) => {
      if (error) {
        ctx.toast(`无法用 ${editor} 打开日志: ${error.message.slice(0, 60)}`)
      }
    })
  } else {
    void shell.openPath(LOG_PATH).then((err) => {
      if (err) ctx.toast(`打开日志失败: ${err}`)
    })
  }
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
    const results: ICommand[] = []

    const t = input.toLowerCase()

    if (!input || 'settings'.startsWith(t) || 'config'.startsWith(t) || 'options'.startsWith(t) || 'preferences'.startsWith(t)) {
      results.push({
        id: 'settings',
        name: 'Settings',
        icon: '\u2699\uFE0F',
        preview: 'Open settings — configure shortcut, theme and preferences',
        async execute(ctx: CommandContext): Promise<void> {
          await openSettings(ctx)
        }
      })
    }

    if (!input || 'reload'.startsWith(t)) {
      results.push({
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
      })
    }

    if (!input || 'log'.startsWith(t)) {
      results.push({
        id: 'open-log',
        name: 'Open Log File',
        icon: '\u{1F4C4}',
        preview: `Open main log in ${process.env.EDITOR ? 'editor' : 'default app'} — ~/.futari/logs/main.log`,
        execute: openLogFile
      })
    }

    return results
  }
}

export default settingsPlugin
