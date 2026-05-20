import type { IPlugin, ICommand, PluginContext, CommandContext } from '@shared/plugin-api'
import { app } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { pluginHost } from '@main/plugin-host'
import { prefixRegistry } from '@main/prefix-registry'

const PLUGINS_DIR = join(homedir(), '.futari', 'plugins')

function sanitizeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 60) || 'new-plugin'
}

function generatePluginId(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

function scaffoldJs(pluginName: string, pluginId: string, pluginIcon: string, prefix: string): string {
  return `/// <reference types="futari-plugin-types" />

/**
 * Futari Plugin: ${pluginName}
 *
 * Icon 格式: emoji 文字 / 内联 SVG / data:image URI / https:// URL / file:/// 路径 / 本地图片路径
 *
 * @type {Futari.IPlugin}
 */
const plugin = {
  id: '${pluginId}',
  name: '${pluginName}',
  icon: '${pluginIcon}',
  prefix: '${prefix}',

  async onActivate() {},
  async onDeactivate() {},

  async buildCommands(ctx, input) {
    return []
  },

  async getFallbackCommands(ctx, input) {
    return []
  },
}

module.exports = plugin
`
}

function scaffoldTs(pluginName: string, pluginId: string, pluginIcon: string, prefix: string): string {
  return `/// <reference types="futari-plugin-types" />

/**
 * Futari Plugin: ${pluginName}
 *
 * === 运行时 ===
 * Futari 使用 esbuild 在内存中编译 .ts → CJS，不产生中间文件。
 * import 编译为 require()，第三方库正常从 node_modules 查找。
 *
 * === 类型 / IDE ===
 * 同级目录下的 tsconfig.json 仅供 IDE 类型检查，esbuild 不读取。
 * 已自动生成 tsconfig.json (module: "commonjs")，IDE 不再报 export = 错误。
 *
 * === Icon 格式 ===
 * icon 支持: emoji 文字 / 内联 SVG / data:image URI / https:// URL / file:/// 路径 / 本地图片路径 (.png/.svg/.ico 等)
 */

const plugin: Futari.IPlugin = {
  id: '${pluginId}',
  name: '${pluginName}',
  icon: '${pluginIcon}',
  prefix: '${prefix}',

  async onActivate(): Promise<void> {},
  async onDeactivate(): Promise<void> {},

  async buildCommands(ctx: Futari.PluginContext, input: string): Promise<Futari.ICommand[]> {
    return []
  },

  async getFallbackCommands(ctx: Futari.PluginContext, input: string): Promise<Futari.ICommand[]> {
    return []
  },
}

export = plugin
`
}

function scaffoldTsconfig(): string {
  return JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'commonjs',
      strict: true,
      esModuleInterop: true
    },
    include: ['index.ts']
  }, null, 2) + '\n'
}

function scaffoldDts(pluginName: string): string {
  return `/**
 * Futari Plugin: ${pluginName}
 *
 * TypeScript 类型声明
 * 完整的 API 类型定义来自 futari-plugin-types 包
 *
 * 使用方式:
 *   1. 在本目录运行 \`npm install\` (安装 devDependencies)
 *   2. IDE 自动获得 Futari API 的类型提示
 *   3. 无需手动 import — 所有类型通过 namespace Futari 全局可用
 */

/// <reference types="futari-plugin-types" />

declare const plugin: Futari.IPlugin
export = plugin
`
}

function scaffoldPackageJson(pluginName: string, pluginId: string, lang: 'ts' | 'js', typesPath: string): string {
  const main = lang === 'ts' ? './index.ts' : './index.js'
  const types = lang === 'ts' ? './index.ts' : './index.d.ts'
  return JSON.stringify({
    name: pluginId,
    version: '0.1.0',
    description: pluginName,
    main,
    types,
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
      { type: 'select', key: 'language', label: 'Language', defaultValue: 'ts', options: [
        { label: 'TypeScript', value: 'ts' },
        { label: 'JavaScript', value: 'js' }
      ]}
    ]
  })

  if (!result) {
    ctx.toast('Creation cancelled')
    return
  }

  const pluginName = String(result.name || '').trim()
  const prefix = String(result.prefix || '').trim()
  const icon = String(result.icon || '🔧').trim()
  const language: 'ts' | 'js' = String(result.language || 'ts') === 'js' ? 'js' : 'ts'

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

    if (language === 'ts') {
      writeFileSync(join(pluginDir, 'index.ts'), scaffoldTs(pluginName, pluginId, icon, prefix), 'utf-8')
      writeFileSync(join(pluginDir, 'tsconfig.json'), scaffoldTsconfig(), 'utf-8')
    } else {
      writeFileSync(join(pluginDir, 'index.js'), scaffoldJs(pluginName, pluginId, icon, prefix), 'utf-8')
      writeFileSync(join(pluginDir, 'index.d.ts'), scaffoldDts(pluginName), 'utf-8')
    }
    writeFileSync(join(pluginDir, 'package.json'), scaffoldPackageJson(pluginName, pluginId, language, join(app.getAppPath(), 'types')), 'utf-8')

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

  async buildCommands(_ctx: PluginContext, _input: string): Promise<ICommand[]> {
    return []
  },

  async getFallbackCommands(_ctx: PluginContext, input: string): Promise<ICommand[]> {
    if (input) {
      const t = input.toLowerCase()
      const match = 'create-plugin'.startsWith(t) || 'new-plugin'.startsWith(t)
      if (!match) return []
    }
    return [{
      id: 'create-plugin',
      name: 'Create New Plugin',
      icon: '\u{1F4C1}',
      preview: 'Open form — set name, prefix, and icon',
      async execute(ctx: CommandContext): Promise<void> {
        await createPluginViaForm(ctx)
      }
    }]
  }
}

export default pluginCreator
