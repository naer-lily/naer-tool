import { homedir } from 'os'
import { join } from 'path'
import { exec } from 'child_process'
import type { IPlugin, ICommand, PluginContext, CommandContext } from '@shared/plugin-api'
import { app, shell } from 'electron'
import { configManager } from '@main/config'
import { pluginHost } from '@main/plugin-host'
import { prefixRegistry } from '@main/prefix-registry'
import { applyScale } from '@main/window-manager'

const LOG_PATH = join(homedir(), '.futari', 'logs', 'main.log')

async function openSettings(ctx: CommandContext): Promise<void> {
  const htmlPath = join(app.getAppPath(), 'resources', 'settings.html')
  const cfg = configManager.getRaw()
  const disabledSet = new Set(cfg.disabledPlugins || [])

  const builtinPlugins = pluginHost.getAllRaw().map((p: { id: string; name: string; icon: string }) => ({
    id: p.id,
    name: p.name,
    icon: p.icon,
    disabled: disabledSet.has(p.id) && p.id !== 'settings'
  }))

  const hash = encodeURIComponent(JSON.stringify({
    shortcut: cfg.shortcut || 'Alt+Space',
    theme: cfg.theme || 'dark',
    launchAtStartup: cfg.launchAtStartup || false,
    windowTopRatio: cfg.windowTopRatio ?? 0.12,
    scale: cfg.scale ?? 1.0,
    windowWidth: cfg.windowWidth ?? 800,
    builtinPlugins
  }))
  const url = `file:///${htmlPath.replace(/\\/g, '/')}#${hash}`

  const result = await ctx.openWebView({
    url,
    height: 480,
    injectBaseStyles: true
  })

  if (!result || typeof result !== 'object') {
    return
  }

  const data = result as Record<string, unknown>
  const shortcut = String(data.shortcut || '').trim()
  const theme = (data.theme as 'light' | 'dark') || 'dark'
  const launchAtStartup = Boolean(data.launchAtStartup)
  const windowTopRatio = typeof data.windowTopRatio === 'number' ? data.windowTopRatio : 0.12
  const scale = typeof data.scale === 'number' ? data.scale : 1.0
  const windowWidth = typeof data.windowWidth === 'number' ? data.windowWidth : 800
  const disabledPlugins = Array.isArray(data.disabledPlugins) ? data.disabledPlugins.filter(id => id !== 'settings') as string[] : undefined

  if (!shortcut) return

  configManager.patch({ shortcut, theme, launchAtStartup, windowTopRatio, scale, windowWidth, disabledPlugins })

  if (disabledPlugins !== undefined) {
    pluginHost.setDisabledBuiltins(disabledPlugins)
    prefixRegistry.rebuild()
  }

  applyScale(scale)

  ctx.toast('Settings saved. Restart Futari to apply shortcut and top-ratio changes.')
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
