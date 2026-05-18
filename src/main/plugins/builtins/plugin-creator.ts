import type { IPlugin, CommandMatch, CommandContext } from '@shared/plugin-api'
import { app } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { pluginHost } from '@main/plugin-host'
import { prefixRegistry } from '@main/prefix-registry'

const PLUGINS_DIR = join(homedir(), '.futari', 'plugins')

function sanitizeFileName(name: string): string {
  return name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 60) || 'new-plugin'
}

function generatePluginId(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

function scaffoldJs(pluginName: string, pluginId: string, pluginIcon: string, prefix: string): string {
  return `// Futari Plugin: ${pluginName}

const plugin = {
  id: '${pluginId}',
  name: '${pluginName}',
  icon: '${pluginIcon}',
  prefix: '${prefix}',

  async onActivate() {},
  async onDeactivate() {},

  async buildCommands() {
    return []
  },

  async getFallbackCommands() {
    return []
  },
}

module.exports = plugin
`
}

function scaffoldDts(): string {
  return `// Futari Plugin type declarations
// Provides IDE intellisense for sibling index.js

declare namespace Futari {
  interface CommandMatch { preview: string; priority?: number }

  interface CommandContext {
    input: string
    toast(message: string): void
    showForm(config: Futari.FormConfig): Promise<Record<string, unknown> | null>
    openWebView(config: Futari.WebViewConfig): Promise<unknown>
    closeWebView(): void
    clipboard: {
      writeText(text: string): void
      readText(): string
      writeHTML(html: string): void
      readHTML(): string
      clear(): void
    }
    shell: {
      openExternal(url: string): Promise<void>
      openPath(path: string): Promise<string>
      showItemInFolder(path: string): void
      beep(): void
    }
  }

  interface WebViewConfig {
    html?: string
    htmlPath?: string
    url?: string
    preload?: string
    height?: number
    injectBaseStyles?: boolean
    pluginIcon?: string
  }

  interface FormField {
    type: 'input' | 'number' | 'select' | 'checkbox' | 'radio' | 'switch' | 'textarea' | 'file'
    key: string; label: string; defaultValue?: unknown; placeholder?: string
    required?: boolean; disabled?: boolean; options?: { label: string; value: string }[]
  }

  interface FormConfig { title: string; width?: number; fields: Futari.FormField[] }

  type CommandOutcome = 'close' | 'home'

  interface ICommand {
    id: string; name: string; icon?: string
    match(input: string): CommandMatch | null
    execute(ctx: CommandContext): CommandOutcome | void | Promise<CommandOutcome | void>
  }

  interface IFallbackCommand {
    id: string; name: string; description: string; icon?: string
    matches(input: string): boolean; build(input: string): ICommand
  }

  interface AppInfo { name: string; path: string; pid: number }

  interface IPlugin {
    id: string; name: string; icon: string; prefix?: string
    onActivate(ctx: object): Promise<void>
    onDeactivate(): Promise<void>
    buildCommands(ctx: object): Promise<ICommand[]>
    getFallbackCommands?(ctx: object): Promise<IFallbackCommand[]>
    shouldAutoActivate?(appInfo: AppInfo): boolean
  }
}

declare const plugin: Futari.IPlugin
export default plugin
`
}

function scaffoldPackageJson(pluginName: string, pluginId: string, typesPath: string): string {
  return JSON.stringify({
    name: pluginId,
    version: '0.1.0',
    description: pluginName,
    main: './index.js',
    types: './index.d.ts',
    dependencies: {},
    devDependencies: {
      'futari-plugin-types': `file:${typesPath.replace(/\\/g, '/')}`
    }
  }, null, 2) + '\n'
}

async function createPluginViaForm(ctx: CommandContext): Promise<void> {
  const result = await ctx.showForm({
    title: 'Create New Plugin',
    width: 440,
    fields: [
      { type: 'input', key: 'name', label: 'Plugin Name', defaultValue: ctx.input.trim() || '', placeholder: 'My Plugin', required: true },
      { type: 'input', key: 'prefix', label: 'Prefix (optional)', placeholder: 'my', defaultValue: '' },
      { type: 'input', key: 'icon', label: 'Icon (emoji)', defaultValue: '🔧', placeholder: '🔧' }
    ]
  })

  if (!result) {
    ctx.toast('Creation cancelled')
    return
  }

  const pluginName = String(result.name || '').trim()
  const prefix = String(result.prefix || '').trim()
  const icon = String(result.icon || '🔧').trim()

  if (!pluginName) {
    ctx.toast('Plugin name is required')
    return
  }

  const pluginId = generatePluginId(sanitizeFileName(pluginName))
  const safeDirName = sanitizeFileName(pluginId)
  const pluginDir = join(PLUGINS_DIR, safeDirName)

  try {
    if (!existsSync(PLUGINS_DIR)) {
      mkdirSync(PLUGINS_DIR, { recursive: true })
    }
    if (existsSync(pluginDir)) {
      ctx.toast(`Plugin directory already exists: ${safeDirName}`)
      return
    }
    mkdirSync(pluginDir)
    writeFileSync(join(pluginDir, 'index.js'), scaffoldJs(pluginName, pluginId, icon, prefix), 'utf-8')
    writeFileSync(join(pluginDir, 'index.d.ts'), scaffoldDts(), 'utf-8')
    writeFileSync(join(pluginDir, 'package.json'), scaffoldPackageJson(pluginName, pluginId, join(app.getAppPath(), 'types')), 'utf-8')

    try {
      await pluginHost.loadFromPath(pluginDir)
      prefixRegistry.rebuild()
      ctx.toast(`Plugin created: ~/.futari/plugins/${safeDirName}`)
    } catch (err) {
      ctx.toast(`Plugin created but failed to load: ${String(err).slice(0, 60)}`)
    }
  } catch (e) {
    ctx.toast(`Creation failed: ${String(e).slice(0, 80)}`)
  }
}

const pluginCreator: IPlugin = {
  id: 'plugin-creator',
  name: 'Create Plugin',
  icon: '\u{1F9E9}',

  async onActivate() {},
  async onDeactivate() {},

  async buildCommands() {
    return []
  },

  async getFallbackCommands() {
    return [{
      id: 'create-plugin',
      name: 'Create New Plugin',
      description: 'Scaffold a new plugin in ~/.futari/plugins/',
      icon: '\u{1F4C1}',
      matches(input: string): boolean {
        if (!input) return true
        const t = input.toLowerCase()
        return 'create-plugin'.startsWith(t) || 'new-plugin'.startsWith(t)
      },
      build(_input: string) {
        return {
          id: 'create-plugin',
          name: 'Create New Plugin',
          icon: '\u{1F4C1}',
          match(): CommandMatch {
            return { preview: 'Open form — set name, prefix, and icon', priority: 10 }
          },
          async execute(ctx: CommandContext): Promise<void> {
            await createPluginViaForm(ctx)
          }
        }
      }
    }]
  }
}

export default pluginCreator
