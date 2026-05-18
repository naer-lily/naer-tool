import type { IPlugin, CommandMatch, CommandContext } from '@shared/plugin-api'
import { app } from 'electron'
import { join } from 'path'
import { pluginHost } from '@main/plugin-host'
import { configManager } from '@main/config'
import { prefixRegistry } from '@main/prefix-registry'

function sanitizeFileName(name: string): string {
  return name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 60) || 'new-plugin'
}

function generatePluginId(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

function scaffoldJs(pluginName: string, pluginId: string, pluginIcon: string, prefix: string): string {
  return `// Futari Plugin: ${pluginName}
// User plugins must be .js files (require() cannot load TypeScript directly)
// The sibling .d.ts provides IDE type hints

const plugin = {
  id: '${pluginId}',
  name: '${pluginName}',
  icon: '${pluginIcon}',
  prefix: '${prefix}',

  // Called when plugin is activated (after load/reload)
  async onActivate() {},

  // Called when plugin is deactivated (before unload/reload)
  async onDeactivate() {},

  // Subcommand mode: commands shown after user types prefix + space
  async buildCommands() {
    return []
    // Example:
    // return [{
    //   id: 'my-cmd',
    //   name: 'My Command',
    //   icon: '✨',
    //   match(input) {
    //     return { preview: \`Execute \${input}\`, priority: 10 }
    //   },
    //   execute(ctx) {
    //     ctx.toast(\`You entered: \${ctx.input}\`)
    //     // return 'close' → close window (default for non-WebView)
    //     // return 'home' → back to home screen
    //   }
    // }]
    //
    // WebView multi-file development example:
    // const path = require('path')
    // async execute(ctx) {
    //   // openWebView returns a Promise that resolves when WebView is closed
    //   const result = await ctx.openWebView({
    //     htmlPath: path.join(__dirname, 'page.html'),  // <script src="./lib.js"> works
    //     preload: path.join(__dirname, 'preload.js'),  // require('./lib.js') works
    //     height: 400,
    //     injectBaseStyles: true
    //   })
    //   // Runs after WebView closes; result is from futariWeb.close(data)
    //   // If result is defined → auto 'close' window
    //   // If result is undefined → auto 'home' (user cancelled)
    //   // Can override: return 'home' to stay even after successful save
    // }
  },

  // Global commands (main mode matching): no prefix needed
  async getFallbackCommands() {
    return []
    // Example:
    // return [{
    //   id: 'my-global',
    //   name: 'My Global Command',
    //   description: 'Description shown in main search box',
    //   icon: '✨',
    //   matches(input) { return input === 'keyword' },
    //   build(input) {
    //     return {
    //       id: 'my-global',
    //       name: 'My Global Command',
    //       icon: '✨',
      //   match() { return { preview: 'Preview text', priority: 10 } },
      //   execute(ctx) { ctx.toast('Executed') }
      //     // return 'close' → close window | return 'home' → back to home
    //     }
    //   }
    // }]
  },

  // Auto-activate: match foreground window to auto-enter subcommand mode (optional)
  // shouldAutoActivate(appInfo) {
  //   return appInfo.name === 'notepad.exe'
  // },
}

module.exports = plugin
`
}

function scaffoldDts(): string {
  return `// Futari Plugin type declarations
// Provides IDE intellisense for sibling index.js (no import needed, type-checking only)

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
    key: string
    label: string
    defaultValue?: unknown
    placeholder?: string
    required?: boolean
    disabled?: boolean
    options?: { label: string; value: string }[]
  }

  interface FormConfig {
    title: string
    width?: number
    fields: Futari.FormField[]
  }

  type CommandOutcome = 'close' | 'home'

  interface ICommand {
    id: string; name: string; icon?: string
    match(input: string): CommandMatch | null
    execute(ctx: CommandContext): CommandOutcome | void | Promise<CommandOutcome | void>
  }

  interface IFallbackCommand {
    id: string; name: string; description: string; icon?: string
    matches(input: string): boolean
    build(input: string): ICommand
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
      { type: 'input', key: 'icon', label: 'Icon (emoji)', defaultValue: '🔧', placeholder: '🔧' },
      { type: 'file', key: 'folder', label: 'Target Folder', required: true }
    ]
  })

  if (!result) {
    ctx.toast('Creation cancelled')
    return
  }

  const pluginName = String(result.name || '').trim()
  const prefix = String(result.prefix || '').trim()
  const icon = String(result.icon || '🔧').trim()
  const folder = String(result.folder || '').trim()

  if (!pluginName || !folder) {
    ctx.toast('Plugin name and target folder are required')
    return
  }

  const pluginId = generatePluginId(sanitizeFileName(pluginName))
  const safeDirName = sanitizeFileName(pluginId)

  const fsp = require('fs')
  const pth = require('path')
  const pluginDir = pth.join(folder, safeDirName)

  try {
    if (fsp.existsSync(pluginDir)) {
      ctx.toast(`Directory already exists: ${pluginDir}`)
      return
    }
    fsp.mkdirSync(pluginDir)
    fsp.writeFileSync(pth.join(pluginDir, 'index.js'), scaffoldJs(pluginName, pluginId, icon, prefix), 'utf-8')
    fsp.writeFileSync(pth.join(pluginDir, 'index.d.ts'), scaffoldDts(), 'utf-8')
    fsp.writeFileSync(pth.join(pluginDir, 'package.json'), scaffoldPackageJson(pluginName, pluginId, join(app.getAppPath(), 'types')), 'utf-8')

    const indexPath = pth.join(pluginDir, 'index.js')
    configManager.addPlugin(indexPath)
    try {
      await pluginHost.loadFromPath(indexPath)
      prefixRegistry.rebuild()
      ctx.toast(`Plugin created and loaded: ${pluginDir}`)
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
      description: 'Fill form to scaffold plugin skeleton (index.js + index.d.ts + package.json)',
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
            return { preview: 'Open form — set name, prefix, icon and target folder', priority: 10 }
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
