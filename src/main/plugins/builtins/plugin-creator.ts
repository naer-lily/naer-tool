import type { IPlugin, CommandMatch, CommandContext } from '@shared/plugin-api'

function sanitizeFileName(name: string): string {
  return name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 60) || 'new-plugin'
}

function generatePluginId(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

function scaffoldJs(pluginName: string, pluginId: string, pluginIcon: string, prefix: string): string {
  return `// NaerTool 插件: ${pluginName}
// 用户插件必须是 .js 文件（require() 不能直接加载 TypeScript）
// 同级目录下的 .d.ts 提供 IDE 类型提示

const plugin = {
  id: '${pluginId}',
  name: '${pluginName}',
  icon: '${pluginIcon}',
  prefix: '${prefix}',

  // 插件激活时调用（加载 / 重载后）
  async onActivate() {},

  // 插件停用时调用（卸载 / 重载前）
  async onDeactivate() {},

  // 子命令模式：用户输入 "前缀 " 后返回的命令列表
  async buildCommands() {
    return []
    // 示例:
    // return [{
    //   id: 'my-cmd',
    //   name: '我的命令',
    //   icon: '✨',
    //   match(input) {
    //     return { preview: \`执行 \${input}\`, priority: 10 }
    //   },
    //   execute(ctx) {
    //     ctx.toast(\`你输入了: \${ctx.input}\`)
    //   }
    // }]
  },

  // 全局命令（主模式匹配）：不需要前缀
  async getFallbackCommands() {
    return []
    // 示例:
    // return [{
    //   id: 'my-global',
    //   name: '我的全局命令',
    //   description: '在主搜索框显示的描述文本',
    //   icon: '✨',
    //   matches(input) { return input === '关键词' },
    //   build(input) {
    //     return {
    //       id: 'my-global',
    //       name: '我的全局命令',
    //       icon: '✨',
    //       match() { return { preview: '预览文本', priority: 10 } },
    //       execute(ctx) { ctx.toast('已执行') }
    //     }
    //   }
    // }]
  },

  // 自动激活：NaerTool 显示时匹配前台窗口自动进入子命令模式（可选）
  // shouldAutoActivate(appInfo) {
  //   return appInfo.name === 'notepad.exe'
  // },
}

module.exports = plugin
`
}

function scaffoldDts(): string {
  return `// NaerTool 插件类型声明
// 为同级 index.js 提供 IDE 智能提示（无需导入，仅用于类型检查）

declare namespace NaerTool {
  interface CommandMatch { preview: string; priority?: number }

  interface CommandContext {
    input: string
    toast(message: string): void
    showForm(config: NaerTool.FormConfig): Promise<Record<string, unknown> | null>
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
    fields: NaerTool.FormField[]
  }

  interface ICommand {
    id: string; name: string; icon?: string
    match(input: string): CommandMatch | null
    execute(ctx: CommandContext): void | Promise<void>
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

declare const plugin: NaerTool.IPlugin
export default plugin
`
}

async function createPluginViaForm(ctx: CommandContext): Promise<void> {
  const result = await ctx.showForm({
    title: '创建新插件',
    width: 440,
    fields: [
      { type: 'input', key: 'name', label: '插件名称', defaultValue: ctx.input.trim() || '', placeholder: '我的插件', required: true },
      { type: 'input', key: 'prefix', label: '前缀（可选）', placeholder: 'my', defaultValue: '' },
      { type: 'input', key: 'icon', label: '图标（emoji）', defaultValue: '🔧', placeholder: '🔧' },
      { type: 'file', key: 'folder', label: '目标文件夹', required: true }
    ]
  })

  if (!result) {
    ctx.toast('已取消创建')
    return
  }

  const pluginName = String(result.name || '').trim()
  const prefix = String(result.prefix || '').trim()
  const icon = String(result.icon || '🔧').trim()
  const folder = String(result.folder || '').trim()

  if (!pluginName || !folder) {
    ctx.toast('插件名称和目标文件夹不能为空')
    return
  }

  const pluginId = generatePluginId(sanitizeFileName(pluginName))
  const safeDirName = sanitizeFileName(pluginId)

  const fsp = require('fs')
  const pth = require('path')
  const pluginDir = pth.join(folder, safeDirName)

  try {
    if (fsp.existsSync(pluginDir)) {
      ctx.toast(`目录已存在: ${pluginDir}`)
      return
    }
    fsp.mkdirSync(pluginDir)
    fsp.writeFileSync(pth.join(pluginDir, 'index.js'), scaffoldJs(pluginName, pluginId, icon, prefix), 'utf-8')
    fsp.writeFileSync(pth.join(pluginDir, 'index.d.ts'), scaffoldDts(), 'utf-8')
    ctx.toast(`插件已创建: ${pluginDir}`)
  } catch (e) {
    ctx.toast(`创建失败: ${String(e).slice(0, 80)}`)
  }
}

const pluginCreator: IPlugin = {
  id: 'plugin-creator',
  name: '创建插件',
  icon: '\u{1F9E9}',

  async onActivate() {},
  async onDeactivate() {},

  async buildCommands() {
    return []
  },

  async getFallbackCommands() {
    return [{
      id: 'create-plugin',
      name: '创建新插件',
      description: '填写表单，创建插件骨架 (index.js + index.d.ts)',
      icon: '\u{1F4C1}',
      matches(input: string): boolean {
        if (!input) return true
        const t = input.toLowerCase()
        return '创建插件'.startsWith(t) || '创建新插件'.startsWith(t) || 'create-plugin'.startsWith(t) || 'new-plugin'.startsWith(t)
      },
      build(_input: string) {
        return {
          id: 'create-plugin',
          name: '创建新插件',
          icon: '\u{1F4C1}',
          match(): CommandMatch {
            return { preview: '打开表单 — 填写名称、前缀、图标并选择文件夹', priority: 10 }
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
