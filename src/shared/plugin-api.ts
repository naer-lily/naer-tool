import type { WebViewConfig } from './web-view-api'

export interface StaticCommandDef {
  id: string
  name: string
  icon?: string
  match(input: string): { preview: string } | null
  execute(ctx: CommandContext): CommandOutcome | void | Promise<CommandOutcome | void>
}

export interface FormField {
  type: 'input' | 'number' | 'select' | 'checkbox' | 'radio' | 'switch' | 'textarea' | 'file'
  key: string
  label: string
  defaultValue?: unknown
  placeholder?: string
  required?: boolean
  disabled?: boolean
  options?: { label: string; value: string }[]
}

export interface FormConfig {
  title: string
  width?: number
  fields: FormField[]
}

export interface CompanionConfig {
  command: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  mode?: 'jsonl' | 'http'
  http?: {
    healthPath?: string
    timeout?: number
  }
}

export interface CompanionHandle {
  pid: number
  config: CompanionConfig
  url?: string
  send(data: unknown): void
  onMessage(callback: (data: unknown) => void): () => void
  kill(): void
}

export interface PluginLogger {
  error(...args: unknown[]): void
  warn(...args: unknown[]): void
  info(...args: unknown[]): void
  debug(...args: unknown[]): void
  trace(...args: unknown[]): void
}

export interface CommandContext {
  input: string
  toast(message: string): void
  showForm(config: FormConfig): Promise<Record<string, unknown> | null>
  openWebView: (config: WebViewConfig) => Promise<unknown>
  closeWebView: () => void
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
  companions: CompanionHandle[]
  log: PluginLogger
}

export type CommandResult = void | Promise<void>

export type CommandOutcome = 'close' | 'home'

export interface ICommand {
  id: string
  name: string
  icon?: string
  preview: string

  execute(ctx: CommandContext): CommandOutcome | void | Promise<CommandOutcome | void>
}

export interface AppInfo {
  name: string
  path: string
  pid: number
}

export interface PluginContext {
  companions: CompanionHandle[]
  log: PluginLogger
}

export interface TrayMenuItem {
  label: string
  click(): void
}

export interface IPlugin {
  id: string
  name: string
  icon: string
  prefix?: string

  onActivate(ctx: PluginContext): Promise<void>
  onDeactivate(): Promise<void>

  buildCommands(ctx: PluginContext, input: string): Promise<ICommand[]>
  getFallbackCommands?(ctx: PluginContext, input: string): Promise<ICommand[]>
  shouldAutoActivate?(appInfo: AppInfo): boolean
  getTrayItems?(): TrayMenuItem[]
  companion?: CompanionConfig | CompanionConfig[]
}

export interface SearchResult {
  id: string
  pluginId: string
  name: string
  icon?: string
  preview: string
  shortcutIndex: number
  prefixEntry?: string
}

export interface SearchResponse {
  mode: 'main' | 'subcommand'
  pluginId?: string
  pluginIcon?: string
  results: SearchResult[]
}

/**
 * 静态命令策略辅助函数 — 将传统的 match() 模式适配为动态 buildCommands 签名
 *
 * 用法：
 *   buildCommands: staticCommands([
 *     { id: 'calc', name: '计算', match(input) { ... }, execute(ctx) { ... } }
 *   ])
 *
 * @param defs 传统 StaticCommandDef 数组
 * @returns 符合 buildCommands(ctx, input) 签名的函数
 */
export function staticCommands(defs: StaticCommandDef[]): (_ctx: PluginContext, input: string) => Promise<ICommand[]> {
  // eslint-disable-next-line @typescript-eslint/require-await
  return async (_ctx: PluginContext, input: string): Promise<ICommand[]> => {
    const results: ICommand[] = []
    for (const def of defs) {
      const m = def.match(input)
      if (m) {
        results.push({
          id: def.id,
          name: def.name,
          icon: def.icon,
          preview: m.preview,
          execute: def.execute
        })
      }
    }
    return results
  }
}
