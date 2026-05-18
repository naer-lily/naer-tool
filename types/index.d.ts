/**
 * Futari Plugin Type Declarations
 *
 * 使用方式:
 *   package.json → "devDependencies": { "futari-plugin-types": "file:..." }
 *   npm install → IDE 自动获得类型提示，无需 import
 */

declare namespace Futari {

  /** 命令匹配结果，由 ICommand.match() 返回 */
  interface CommandMatch {
    /** 搜索结果中显示的预览文本 */
    preview: string
    /** 排序优先级，数值越大越靠前 (默认 0) */
    priority?: number
  }

  /**
   * 命令执行上下文 — 插件通过 ctx 与 Futari 交互
   *
   * 每个命令执行时框架会创建一个新的 ctx 实例
   */
  interface CommandContext {
    /** 用户在搜索框中输入的文本 (去除前缀后的部分) */
    input: string

    /** 在窗口底部显示一条短暂提示 (自动消失) */
    toast(message: string): void

    /**
     * 弹出表单对话框
     * @returns 用户提交的键值对，取消则返回 null
     */
    showForm(config: Futari.FormConfig): Promise<Record<string, unknown> | null>

    /**
     * 打开 WebView 面板，阻塞直到用户关闭
     *
     * 返回值区分完成/取消:
     *   - `futariWeb.close(data)` → resolve 为 data → 视为任务完成
     *   - `futariWeb.close()` 无参 → resolve 为 undefined → 视为取消
     *
     * 可以连续多次调用以串联多个 WebView 页面
     */
    openWebView(config: Futari.WebViewConfig): Promise<unknown>

    /** 强制关闭当前 WebView (相当于 futariWeb.close()) */
    closeWebView(): void

    /** 系统剪贴板操作 */
    clipboard: {
      writeText(text: string): void
      readText(): string
      writeHTML(html: string): void
      readHTML(): string
      clear(): void
    }

    /** 系统 Shell 操作 */
    shell: {
      /** 用外部默认程序打开 URL */
      openExternal(url: string): Promise<void>
      /** 用系统默认程序打开文件/目录，返回错误信息或空字符串 */
      openPath(path: string): Promise<string>
      /** 在文件管理器中展示文件 */
      showItemInFolder(path: string): void
      /** 播放系统提示音 */
      beep(): void
    }
  }

  /** WebView 面板配置 */
  interface WebViewConfig {
    /** 内联 HTML 内容 (适合简单页面) */
    html?: string
    /** HTML 文件路径 → 加载为 file:/// URL (支持 <script src="./lib.js">) */
    htmlPath?: string
    /** 任意 URL (file:/// 或 https://) */
    url?: string
    /** 插件 preload 文件路径 (可以通过 require() 加载 Node.js 模块) */
    preload?: string
    /** 内容区域高度 (默认 450) */
    height?: number
    /** 是否注入基础样式 (滚动条、盒模型、字体重置) */
    injectBaseStyles?: boolean
    /** 框架自动设置 — 插件代码中请勿手动指定 */
    pluginIcon?: string
  }

  /** 表单字段定义 */
  interface FormField {
    type: 'input' | 'number' | 'select' | 'checkbox' | 'radio' | 'switch' | 'textarea' | 'file'
    /** 字段键名，提交时作为 key */
    key: string
    /** 字段显示标签 */
    label: string
    /** 默认值 */
    defaultValue?: unknown
    /** 占位文本 */
    placeholder?: string
    /** 是否必填 */
    required?: boolean
    /** 是否禁用 */
    disabled?: boolean
    /** select/radio 的选项列表 */
    options?: { label: string; value: string }[]
  }

  /** 表单对话框配置 */
  interface FormConfig {
    /** 对话框标题 */
    title: string
    /** 对话框宽度 (默认 400) */
    width?: number
    /** 表单字段列表 */
    fields: Futari.FormField[]
  }

  /**
   * 命令执行后的行为指令
   *
   * - `'close'` — 关闭 Futari 窗口 (强制，覆盖 WebView 推断)
   * - `'home'`  — 返回主搜索页 (强制，覆盖 WebView 推断)
   * - 不返回 (undefined) — 由框架自动判断
   */
  type CommandOutcome = 'close' | 'home'

  /**
   * 子命令 — 用户输入前缀后出现在列表中的项
   *
   * match() 在每次按键时调用，execute() 仅在选中后调用一次
   */
  interface ICommand {
    /** 命令唯一标识 (插件内唯一) */
    id: string
    /** 命令显示名称 */
    name: string
    /** 命令图标 (emoji 或 SVG 字符串) */
    icon?: string

    /**
     * 检查用户输入是否匹配此命令
     * @returns 匹配结果 (含预览文本) 或 null 表示不匹配
     */
    match(input: string): CommandMatch | null

    /**
     * 执行命令
     * @returns CommandOutcome 可选，不返回则由框架推断 (详见 CommandOutcome)
     */
    execute(ctx: CommandContext): CommandOutcome | void | Promise<CommandOutcome | void>
  }

  /**
   * 全局回退命令 — 不需要前缀，在主搜索框中匹配
   *
   * matches() 判断是否触发，build() 构造可执行的 ICommand
   */
  interface IFallbackCommand {
    /** 命令唯一标识 (全局唯一) */
    id: string
    /** 命令显示名称 */
    name: string
    /** 主搜索框中显示的描述文本 */
    description: string
    /** 命令图标 */
    icon?: string

    /**
     * 判断用户输入是否匹配此命令
     * @param input 用户输入的原始文本
     */
    matches(input: string): boolean

    /**
     * 构造可执行的命令实例
     * @param input 用户输入的原始文本
     */
    build(input: string): ICommand
  }

  /** 前台窗口信息 (用于 shouldAutoActivate) */
  interface AppInfo {
    /** 进程名 (如 "notepad.exe") */
    name: string
    /** 可执行文件完整路径 */
    path: string
    /** 进程 ID */
    pid: number
  }

  /**
   * Futari 插件入口
   *
   * ```js
   * const plugin = {
   *   id: 'my-plugin',
   *   name: 'My Plugin',
   *   icon: '🔧',
   *   prefix: 'my',
   *   async onActivate() {},
   *   async onDeactivate() {},
   *   async buildCommands() { return [...] },
   *   async getFallbackCommands() { return [...] },
   *   shouldAutoActivate(appInfo) { return appInfo.name === 'notepad.exe' },
   * }
   * module.exports = plugin
   * ```
   */
  interface IPlugin {
    /** 插件唯一标识 */
    id: string
    /** 插件显示名称 */
    name: string
    /** 插件图标 (emoji 或 SVG 字符串) */
    icon: string
    /** 命令前缀 — 用户输入此前缀+空格进入子命令模式 (可选) */
    prefix?: string

    /** 插件激活 (加载/重载后) */
    onActivate(ctx: object): Promise<void>
    /** 插件停用 (卸载/重载前) */
    onDeactivate(): Promise<void>

    /** 返回子命令列表 (用户输入前缀后调用一次) */
    buildCommands(ctx: object): Promise<ICommand[]>

    /** 返回全局回退命令列表 (可选，有 prefix 的插件也可以提供) */
    getFallbackCommands?(ctx: object): Promise<IFallbackCommand[]>

    /**
     * 窗口显示时检查前台窗口，决定是否自动进入子命令模式 (可选)
     * @returns true 表示匹配，将自动进入此插件的子命令模式
     */
    shouldAutoActivate?(appInfo: AppInfo): boolean
  }
}

declare const plugin: Futari.IPlugin
export default plugin
