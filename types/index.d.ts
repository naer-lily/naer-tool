/**
 * Futari Plugin Type Declarations
 *
 * 使用方式:
 *   package.json → "devDependencies": { "futari-plugin-types": "file:..." }
 *   npm install → IDE 自动获得类型提示，无需 import
 */

declare namespace Futari {

  /** staticCommands 辅助函数的命令定义 */
  interface StaticCommandDef {
    id: string
    name: string
    icon?: string
    match(input: string): { preview: string } | null
    execute(ctx: Futari.CommandContext): Futari.CommandOutcome | void | Promise<Futari.CommandOutcome | void>
  }

  /** 伴生进程配置 */
  interface CompanionConfig {
    /** 可执行文件或脚本路径 (支持任意语言) */
    command: string
    /** 命令行参数 */
    args?: string[]
    /** 工作目录 */
    cwd?: string
    /** 环境变量 (合并到当前环境) */
    env?: Record<string, string>
    /**
     * 通信模式:
     *   - 'jsonl' (默认): stdin/stdout 走 JSON-line 协议
     *   - 'http': 启动 HTTP 服务，框架自动分配 PORT 并轮询健康检查
     */
    mode?: 'jsonl' | 'http'
    /** HTTP 模式配置 */
    http?: {
      /** 健康检查路径 (默认 /health) */
      healthPath?: string
      /** 健康检查超时毫秒 (默认 10000) */
      timeout?: number
    }
  }

  /** 伴生进程句柄 */
  interface CompanionHandle {
    /** 进程 ID */
    pid: number
    /** 当前配置 */
    config: CompanionConfig
    /** HTTP 模式: 框架分配的 URL (如 http://127.0.0.1:12345) */
    url?: string
    /** stdio 模式: 发送 JSON 数据到进程 stdin */
    send(data: unknown): void
    /** stdio 模式: 监听进程 stdout JSON 消息，返回取消监听函数 */
    onMessage(callback: (data: unknown) => void): () => void
    /** 终止进程 */
    kill(): void
  }

  /** 插件日志接口 */
  interface PluginLogger {
    error(...args: unknown[]): void
    warn(...args: unknown[]): void
    info(...args: unknown[]): void
    debug(...args: unknown[]): void
    trace(...args: unknown[]): void
  }

  /** 插件上下文 (传递给 onActivate, buildCommands 等) */
  interface PluginContext {
    /** 伴生进程句柄列表 */
    companions: CompanionHandle[]
    /** 日志记录器 */
    log: PluginLogger
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

    /** 伴生进程句柄列表 */
    companions: CompanionHandle[]

    /** 日志记录器 */
    log: PluginLogger
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
   * 子命令 — 由 buildCommands 或 getFallbackCommands 根据用户输入动态生成
   *
   * 数组顺序决定显示顺序，preview 由插件在生成时直接设定
   */
  interface ICommand {
    /** 命令唯一标识 (插件内唯一) */
    id: string
    /** 命令显示名称 */
    name: string
    /** 命令图标 (emoji 或 SVG 字符串) */
    icon?: string
    /** 搜索结果中显示的预览文本 */
    preview: string

    /**
     * 执行命令
     * @returns CommandOutcome 可选，不返回则由框架推断 (详见 CommandOutcome)
     */
    execute(ctx: CommandContext): CommandOutcome | void | Promise<CommandOutcome | void>
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
   *   companion: { command: './server.exe', args: ['--port', '8080'], mode: 'http' },
   *   async onActivate(ctx) { ctx.log.info('activated') },
   *   async onDeactivate() {},
   *   async buildCommands(ctx, input) { return [...] },
   *   async getFallbackCommands(ctx, input) { return [...] },
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
    /** 伴生进程配置 (可选，支持数组) */
    companion?: CompanionConfig | CompanionConfig[]

    /** 插件激活 (加载/重载后) */
    onActivate(ctx: PluginContext): Promise<void>
    /** 插件停用 (卸载/重载前) */
    onDeactivate(): Promise<void>

    /** 根据用户输入动态返回子命令列表 (每次按键调用)
     * @param input 用户去除前缀后的输入文本
     */
    buildCommands(ctx: PluginContext, input: string): Promise<ICommand[]>

    /** 返回全局回退命令列表 (可选，有 prefix 的插件也可以提供)
     * @param input 用户输入的原始文本 (主搜索框)
     */
    getFallbackCommands?(ctx: PluginContext, input: string): Promise<ICommand[]>

    /**
     * 窗口显示时检查前台窗口，决定是否自动进入子命令模式 (可选)
     * @returns true 表示匹配，将自动进入此插件的子命令模式
     */
    shouldAutoActivate?(appInfo: AppInfo): boolean
  }
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
declare function staticCommands(defs: Futari.StaticCommandDef[]): (ctx: Futari.PluginContext, input: string) => Promise<Futari.ICommand[]>

declare const plugin: Futari.IPlugin
