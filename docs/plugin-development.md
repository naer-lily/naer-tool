# Futari 插件开发指南

本指南面向**不熟悉 Electron** 的读者。只需会写 JavaScript 即可开发插件。

---

## 1. 概述

Futari 是一个基于 Electron 的命令启动器。插件系统让你用**纯 JavaScript** 扩展功能。

**每个插件是一个目录**，包含至少 `index.js`（插件代码），推荐搭配 `index.d.ts`（类型提示）和 `package.json`（包信息）。

```
my-plugin/
├── index.js        ← 插件入口（必须）
├── index.d.ts      ← TypeScript 类型声明（推荐，IDE 自动提示）
├── package.json    ← 包信息、依赖管理（推荐）
├── preload.js      ← WebView 预加载脚本（可选）
├── page.html       ← WebView 页面（可选）
└── lib.js          ← 共享模块（可选）
```

### 1.1 类型声明的分发方式

Futari 附带一个**本地类型包** `futari-plugin-types`，插件无需手动拷贝 `.d.ts`。插件通过 `package.json` 的 `devDependencies` 引用：

```json
{
  "devDependencies": {
    "futari-plugin-types": "file:C:/absolute/path/to/futari/types"
  }
}
```

`npm install` 后会在 `node_modules/` 创建符号链接，IDE 自动获得类型提示。

使用 `创建插件` 命令生成的 `package.json` 已内置此项。若手动创建插件，可在目录下执行：

```bash
npm install --save-dev "C:/path/to/futari/types"
```

> **注意**: 即使不安装类型包，同目录下的 `index.d.ts` 也会被 IDE 自动识别。类型包主要用于避免在多插件项目中重复拷贝 `.d.ts`。

---

## 2. 三套执行环境

理解 Futari 的架构，首先要分清**三个执行环境**。它们隔离且能力不同：

| 环境 | 在哪运行 | 能访问 Node.js？ | 能访问 DOM？ | 典型用途 |
|---|---|---|---|---|
| **主进程** | Electron 主进程 | ✔ `require('fs')` 等全部 | ✖ 无浏览器 API | 插件代码 (`index.js`) |
| **渲染进程** | 搜索窗口的 Chromium | ✖ | ✔ Vue 3 界面 | Futari 自带的搜索 UI |
| **WebView 页面** | WebView 内嵌 Chromium | ✖ | ✔ HTML 页面 | 插件展示的自定义网页 |

**插件代码** (`index.js`) 运行在**主进程**，拥有完整的 Node.js 权限。这与普通网页 JS 完全不同——你可以读写文件、执行系统命令、访问数据库等。

---

## 3. 插件入口文件 (index.js)

### 3.1 最小示例

```javascript
// index.js
const plugin = {
  id: 'my-plugin',
  name: '我的插件',
  icon: '🔧',
  prefix: 'my',  // 可选：激活子命令模式的前缀

  async onActivate() {},
  async onDeactivate() {},

  async buildCommands() {
    return [
      {
        id: 'hello',
        name: '打招呼',
        icon: '👋',
        match(input) {
          return { preview: `你好 ${input || '世界'}`, priority: 10 }
        },
        execute(ctx) {
          ctx.toast(`你好，${ctx.input || '世界'}！`)
        }
      }
    ]
  }
}

module.exports = plugin
```

### 3.2 插件对象结构

```typescript
interface IPlugin {
  id: string              // 唯一标识（如 'my-plugin'）
  name: string            // 显示名称
  icon: string            // emoji 或 SVG 字符串
  prefix?: string         // 激活子命令的前缀（输入 "my " 进入）

  onActivate(ctx): Promise<void>    // 加载/重载时调用
  onDeactivate(): Promise<void>     // 卸载/重载前调用

  buildCommands(ctx): Promise<ICommand[]>      // 子命令列表
  getFallbackCommands?(ctx): Promise<IFallbackCommand[]>  // 全局命令
  shouldAutoActivate?(appInfo): boolean        // 自动激活（匹配前台窗口）
}
```

---

## 4. 命令类型

### 4.1 子命令 (ICommand)

通过 `prefix` 进入子命令模式后展示。`match()` 在用户**每次按键**时调用。

```javascript
{
  id: 'my-cmd',
  name: '我的命令',
  icon: '✨',
  match(input) {
    // 每次按键都调用；返回 null 表示不匹配
    if (!input) return { preview: '请输入内容', priority: 10 }
    return { preview: `执行: ${input}`, priority: 10 }
  },
  execute(ctx) {
    // 用户按 Enter 选中后调用
    ctx.toast(`已执行: ${ctx.input}`)
  }
}
```

### 4.2 全局命令 (IFallbackCommand)

在主模式（无前缀）下生效。`matches()` 做快速过滤，`build()` 返回具体命令。

```javascript
{
  id: 'my-global',
  name: '全局命令',
  description: '在主搜索框显示的描述',
  icon: '🌍',
  matches(input) {
    return input === 'keyword' || input.startsWith('kw')
  },
  build(input) {
    return {
      id: 'my-global',
      name: '全局命令',
      icon: '🌍',
      match() { return { preview: `处理: ${input}`, priority: 10 } },
      execute(ctx) { ctx.toast('已执行') }
    }
  }
}
```

---

## 5. CommandContext API

`execute(ctx)` 收到的 `ctx` 对象提供以下方法：

### 5.1 ctx.toast(message)

在屏幕底部显示浮动提示，1.5 秒后消失。

```javascript
execute(ctx) {
  ctx.toast('操作完成')
}
```

### 5.2 ctx.showForm(config) → Promise

弹出表单窗口，用户填写后返回数据，取消则返回 `null`。

```javascript
execute(ctx) {
  const result = await ctx.showForm({
    title: '用户信息',
    width: 400,
    fields: [
      { type: 'input', key: 'name', label: '姓名', required: true },
      { type: 'number', key: 'age', label: '年龄' },
      { type: 'select', key: 'role', label: '角色',
        options: [{ label: '管理员', value: 'admin' }, { label: '用户', value: 'user' }] },
      { type: 'checkbox', key: 'agree', label: '同意协议', defaultValue: true },
      { type: 'file', key: 'path', label: '文件路径' },
      { type: 'textarea', key: 'desc', label: '备注', placeholder: '可选描述' }
    ]
  })
  if (!result) return  // 用户取消
  ctx.toast(`你好 ${result.name}, 年龄 ${result.age}`)
}
```

字段类型: `input`, `number`, `select`, `checkbox`, `radio`, `switch`, `textarea`, `file`

### 5.3 ctx.openWebView(config)

打开一个嵌入式网页视图（WebView），在搜索框下方显示。详见第 6 节。

### 5.4 ctx.closeWebView()

关闭已打开的 WebView。

---

## 6. WebView 分文件开发

WebView 允许插件展示自定义 HTML 页面，支持两种方式：

- **内联模式**: `html` 字段直接写 HTML 字符串（简单场景）
- **分文件模式**: `htmlPath` + `preload` 引用独立文件（复杂场景）

### 6.1 分文件开发要点

分文件模式下，**HTML 和 preload 都能使用相对路径引用同目录文件**：

```
my-plugin/
├── index.js     ← ctx.openWebView({ htmlPath, preload })
├── page.html    ← <script src="./lib.js">   ✅ 相对导入
├── preload.js   ← require('./lib.js')       ✅ 相对导入
└── lib.js       ← 共享模块
```

**为什么 preload 中用 `require('./lib.js')` 能工作？**
- preload 通过 `require()` 从原目录加载（不会复制到临时文件）
- `__dirname` 指向插件目录，相对路径正确解析
- 可以 `require('electron')` 访问 `ipcRenderer`，但不能 `require('fs')`（preload 非主进程）

**为什么 HTML 中用 `<script src="./lib.js">` 能工作？**
- 页面通过 `file:///` 协议从插件目录加载
- 浏览器原生 `<script>` 相对路径从 HTML 文件位置解析

### 6.2 preload.js 示例

```javascript
// preload.js — 在 WebView 页面加载前执行
const lib = require('./lib.js')   // ✅ 相对导入

// 挂载到 window，供页面 HTML 中的 <script> 访问
window.myUtils = lib
window.theme = 'dark'
```

### 6.3 page.html 示例

```html
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body>
  <div id="output">等待输入...</div>
  <script src="./lib.js"></script>   <!-- ✅ 相对导入 -->
  <script>
    // 通过 futariWeb API 接收搜索框实时输入
    window.futariWeb.onSubInputChange(function(text) {
      document.getElementById('output').textContent =
        myUtils.process(text)  // 使用 lib.js 导出的函数
    })
  </script>
</body>
</html>
```

### 6.4 在 index.js 中使用

```javascript
const path = require('path')

execute(ctx) {
  ctx.openWebView({
    htmlPath: path.join(__dirname, 'page.html'),  // ✅ file:// 加载
    preload: path.join(__dirname, 'preload.js'),   // ✅ 从原目录 require()
    height: 400
  })
}
```

### 6.5 WebView 配置字段

```typescript
interface WebViewConfig {
  html?: string            // 内联 HTML 字符串（data URI 加载）
  htmlPath?: string        // 本地 HTML 文件路径（file:// 加载）← 支持 <script src>
  url?: string             // 任意 URL（http:// 或 file://）
  preload?: string         // preload 脚本路径 ← 支持 require('./lib')
  height?: number          // 视图高度（默认 450）
  injectBaseStyles?: boolean  // 注入基础样式（默认 false，按需开启）
}
```

### 6.6 基础样式注入 (`injectBaseStyles`)

当 `injectBaseStyles: true` 时，Futari 自动注入以下样式：

- **盒模型**: `*,*::before,*::after{box-sizing:border-box}`
- **平滑滚动**: `html{scroll-behavior:smooth}`
- **字体**: 系统默认字体栈（含中文字体）
- **滚动条美化**: 6px 半透明滚动条（暗色/亮色背景通用）

```javascript
// 开启基础样式（适合手写 HTML，免去重复 CSS）
ctx.openWebView({
  htmlPath: path.join(__dirname, 'page.html'),
  preload: path.join(__dirname, 'preload.js'),
  height: 400,
  injectBaseStyles: true
})

// 不开启（默认）— 适合已有完整 CSS 的现成页面
ctx.openWebView({
  url: 'https://example.com',   // 不污染现有样式
  height: 600
})
```

**注意**: 默认关闭 `injectBaseStyles`。如果你引用第三方页面或已有完善样式，不要开启此选项，否则可能覆盖原有样式。

### 6.7 futariWeb API（页面内使用）

WebView 页面中可用 `window.futariWeb`，无需任何导入：

```javascript
// 监听搜索框实时输入
window.futariWeb.onSubInputChange(function(text) {
  console.log('用户输入:', text)  // text 是搜索框当前文本
})

// 发送数据到主进程（主进程转发给渲染进程）
window.futariWeb.send({ type: 'click', x: 100 })

// 动态调整视图高度
window.futariWeb.setHeight(600)

// 查询当前主题（返回 'light' 或 'dark'）
const theme = await window.futariWeb.getTheme()

// 关闭 WebView
window.futariWeb.close()
```

---

## 7. 环境能力速查

| 能力 | 插件代码 (index.js) | preload.js | page.html 内联 JS |
|---|---|---|---|
| `require('fs')` | ✔ | ✖ | ✖ |
| `require('path')` | ✔ | ✖ | ✖ |
| `require('electron')` | ✔ | ✔ | ✖ |
| `require('./lib.js')` | ✔ | ✔ | ✖ |
| `<script src="./lib.js">` | - | - | ✔ (需 htmlPath) |
| `document.querySelector` | ✖ | ✔ | ✔ |
| `window.futariWeb` | ✖ | ✔ | ✔ |
| `__dirname` | ✔ (插件目录) | ✔ (插件目录) | ✖ |
| `process` | ✔ | ✔ | ✖ |
| 执行系统命令 | ✔ | ✖ | ✖ |

---

## 8. 自动激活 (shouldAutoActivate)

插件可以在 Futari 窗口显示时，自动检测前台窗口并进入子命令模式。

```javascript
shouldAutoActivate(appInfo) {
  // appInfo: { name: 'notepad.exe', path: 'C:\\...', pid: 1234 }
  return appInfo.name.toLowerCase().includes('notepad')
}
```

当用户在记事本窗口中按下全局快捷键打开 Futari 时，自动进入该插件的子命令模式。

---

## 9. 完整示例：天气查询插件

```
weather-plugin/
├── index.js        ← 插件入口
├── index.d.ts      ← 类型声明
├── package.json    ← 包信息
├── preload.js      ← WebView preload
├── page.html       ← 天气展示页
└── weather-api.js  ← 天气 API 封装（被 preload 和 index.js 共享）
```

**index.js**:
```javascript
const path = require('path')
const { queryWeather } = require('./weather-api')

const plugin = {
  id: 'weather',
  name: '天气查询',
  icon: '🌤️',
  prefix: 'wx',

  async onActivate() {},
  async onDeactivate() {},

  async buildCommands() {
    return [{
      id: 'query',
      name: '查询天气',
      icon: '🌤️',
      match(input) {
        const city = input.trim()
        if (!city) return { preview: '输入城市名查询天气', priority: 10 }
        return { preview: `查询 ${city} 天气`, priority: 10 }
      },
      execute(ctx) {
        ctx.openWebView({
          htmlPath: path.join(__dirname, 'page.html'),
          preload: path.join(__dirname, 'preload.js'),
          height: 360
        })
        // 主进程查询天气并缓存到全局
        queryWeather(ctx.input).then(data => {
          global.__weatherData = data
        })
      }
    }]
  }
}

module.exports = plugin
```

**preload.js**:
```javascript
const { queryWeather } = require('./weather-api')

window.fetchWeather = async function(city) {
  return queryWeather(city)
}
```

**page.html**:
```html
<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body>
  <div id="weather"></div>
  <script>
    window.futariWeb.onSubInputChange(async function(city) {
      if (!city) return
      const data = await window.fetchWeather(city)
      document.getElementById('weather').textContent =
        data.city + ': ' + data.temp + '°C'
    })
  </script>
</body></html>
```

**weather-api.js**（被 index.js 和 preload.js 共享）:
```javascript
async function queryWeather(city) {
  // index.js 中可用 require('https') —— 主进程有 Node.js
  // preload.js 中需用 fetch() —— preload 是浏览器环境
  if (typeof require !== 'undefined') {
    // 主进程：使用 Node.js http 模块
    return { city, temp: 'N/A (主进程直连)' }
  } else {
    // preload 环境：使用浏览器 fetch
    return { city, temp: 'N/A (浏览器 fetch)' }
  }
}

module.exports = { queryWeather }
```

---

## 10. 调试技巧

- **插件代码 (index.js)**: `console.log()` 输出到主进程控制台（启动 Electron 的终端）
- **preload.js**: `console.log()` 输出到 WebView 开发者工具（`mainWin.webContents.openDevTools()`）
- **page.html**: `console.log()` 同上
- **重新加载**: 修改插件后，执行 Futari 的 "Reload Plugins" 命令（无需重启应用）

---

## 11. 常见问题

### Q: 为什么 preload.js 和 page.html 不能使用 `require('fs')`？
A: preload 和 WebView 页面运行在浏览器环境中，不是 Node.js 主进程。preload 可以用 `require('electron')` 获取 `ipcRenderer` 进行进程通信，但不能访问文件系统。

### Q: page.html 能发 HTTP 请求吗？
A: 可以。WebView 页面就是普通浏览器环境，支持 `fetch()`、`XMLHttpRequest` 等。

### Q: 插件能安装 npm 包吗？
A: 可以。在插件目录创建 `package.json`，添加依赖后运行 `npm install`。插件运行在主进程，可以通过 `require('some-package')` 使用。

### Q: 如何在 page.html 和 index.js 之间传递数据？
A: 通过 `futariWeb.send()` 从页面发送消息，在主进程中监听 `web-view-message` IPC 通道。
