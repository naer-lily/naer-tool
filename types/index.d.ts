// Futari Plugin Type Declarations
// 引用方式: package.json → "devDependencies": { "futari-plugin-types": "file:..." }
// 然后 npm install → IDE 自动获得类型提示

declare namespace Futari {
  interface CommandMatch {
    preview: string
    priority?: number
  }

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
