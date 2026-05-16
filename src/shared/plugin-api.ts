export interface CommandMatch {
  preview: string
  priority?: number
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

export interface CommandContext {
  input: string
  toast(message: string): void
  showForm(config: FormConfig): Promise<Record<string, unknown> | null>
}

export type CommandResult = void

export interface ICommand {
  id: string
  name: string
  icon?: string

  match(input: string): CommandMatch | null
  execute(ctx: CommandContext): void | Promise<void>
}

export interface IFallbackCommand {
  id: string
  name: string
  description: string
  icon?: string

  matches(input: string): boolean
  build(input: string): ICommand
}

export interface AppInfo {
  name: string
  path: string
  pid: number
}

export interface PluginContext {
  // Expanded in later phases
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

  buildCommands(ctx: PluginContext): Promise<ICommand[]>

  getFallbackCommands?(ctx: PluginContext): Promise<IFallbackCommand[]>
  shouldAutoActivate?(appInfo: AppInfo): boolean
  getTrayItems?(): TrayMenuItem[]
}

export interface SearchResult {
  id: string
  pluginId: string
  name: string
  icon?: string
  preview: string
  priority: number
  shortcutIndex: number
  prefixEntry?: string
}

export interface SearchResponse {
  mode: 'main' | 'subcommand'
  pluginId?: string
  pluginIcon?: string
  results: SearchResult[]
}
