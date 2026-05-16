import type { IPlugin, CommandMatch, CommandContext } from '@shared/plugin-api'

function sanitizeFileName(name: string): string {
  return name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 60) || 'new-plugin'
}

function generatePluginId(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

function scaffoldJs(pluginName: string, pluginId: string): string {
  return `// NaerTool 插件: ${pluginName}
// 用户插件必须是 .js 文件（require() 不能直接加载 TypeScript）
// 同级目录下的 .d.ts 提供 IDE 类型提示

/**
 * @type {import('naer-tool').IPlugin}
 */
const plugin = {
  // 插件唯一标识（必填）
  id: '${pluginId}',
  // 显示名称（必填）
  name: '${pluginName}',
  // 显示图标（必填，emoji 或文本字符）
  icon: '🔧',
  // 前缀：用户输入 "前缀 " 进入子命令模式（可选，留空则仅提供全局命令）
  prefix: '',

  // ===== 生命周期 =====

  // 插件激活时调用（加载 / 重载后）
  async onActivate() {},

  // 插件停用时调用（卸载 / 重载前）
  async onDeactivate() {},

  // ===== 子命令模式 =====
  // 用户输入 "前缀 " 后，返回的命令列表将显示在搜索结果中
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

  // ===== 全局命令（主模式匹配）=====
  // 无需前缀，用户在主搜索框输入即可匹配
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

  // ===== 自动激活（可选）=====
  // NaerTool 显示时，若前台窗口匹配则自动进入子命令模式
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
  interface CommandMatch {
    preview: string
    priority?: number
  }

  interface CommandContext {
    /** 用户输入的文本 */
    input: string
    /** 在屏幕底部显示浮动提示 */
    toast(message: string): void
  }

  interface ICommand {
    id: string
    name: string
    icon?: string
    match(input: string): CommandMatch | null
    execute(ctx: CommandContext): void | Promise<void>
  }

  interface IFallbackCommand {
    id: string
    name: string
    description: string
    icon?: string
    matches(input: string): boolean
    build(input: string): ICommand
  }

  interface AppInfo {
    name: string
    path: string
    pid: number
  }

  interface IPlugin {
    id: string
    name: string
    icon: string
    prefix?: string
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

function doCreatePlugin(pluginName: string, showToast: (msg: string) => void): void {
  const pluginId = generatePluginId(sanitizeFileName(pluginName))
  const safeDirName = sanitizeFileName(pluginId)

  const { dialog } = require('electron')
  const fs = require('fs')
  const path = require('path')

  dialog.showOpenDialog({
    title: `创建插件 "${pluginName}" — 选择父文件夹`,
    properties: ['openDirectory']
  }).then((result: { canceled: boolean; filePaths: string[] }) => {
    if (result.canceled || !result.filePaths.length) {
      showToast('已取消创建')
      return
    }

    const parentDir = result.filePaths[0]
    const pluginDir = path.join(parentDir, safeDirName)

    try {
      if (fs.existsSync(pluginDir)) {
        showToast(`目录已存在: ${pluginDir}`)
        return
      }
      fs.mkdirSync(pluginDir)

      const jsContent = scaffoldJs(pluginName, pluginId)
      const dtsContent = scaffoldDts()

      fs.writeFileSync(path.join(pluginDir, 'index.js'), jsContent, 'utf-8')
      fs.writeFileSync(path.join(pluginDir, 'index.d.ts'), dtsContent, 'utf-8')

      showToast(`插件已创建: ${pluginDir}`)
    } catch (e) {
      showToast(`创建失败: ${String(e).slice(0, 80)}`)
    }
  }).catch((e: Error) => {
    showToast(`对话框错误: ${e.message.slice(0, 80)}`)
  })
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
      description: '选择文件夹，创建插件骨架 (index.js + index.d.ts)',
      icon: '\u{1F4C1}',
      matches(input: string): boolean {
        if (!input) return true
        const t = input.toLowerCase()
        return '创建插件'.startsWith(t) || '创建新插件'.startsWith(t) || 'create-plugin'.startsWith(t) || 'new-plugin'.startsWith(t)
      },
      build(input: string) {
        const pluginName = input.trim() || '新插件'
        return {
          id: 'create-plugin',
          name: '创建新插件',
          icon: '\u{1F4C1}',
          match(): CommandMatch {
            const name = input.trim()
            if (!name) return { preview: '输入插件名称后回车选择目标文件夹', priority: 10 }
            return { preview: `创建插件 "${name}" — 回车选择文件夹`, priority: 10 }
          },
          execute(ctx: CommandContext): void {
            doCreatePlugin(ctx.input.trim() || '新插件', ctx.toast)
          }
        }
      }
    }]
  }
}

export default pluginCreator
