import type { IPlugin, CommandMatch, CommandContext, AppInfo } from '@shared/plugin-api'
import { mkdirSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

function setupMultiFileTest(): { dir: string; htmlPath: string; preloadPath: string } {
  const dir = join(tmpdir(), 'futari-multi-test')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const libJs = `// 共享模块: preload.js 和 page.html 都引用这个文件
// preload.js 通过 require('./lib.js') 引用
// page.html 通过 <script src="./lib.js"> 引用

function formatColor(name) {
  var colors = { red: '#e06c75', green: '#98c379', blue: '#61afef', purple: '#c678dd', orange: '#d19a66' }
  return colors[name] || '#abb2bf'
}

// 在 preload (Node.js) 环境: 导出为模块
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { formatColor: formatColor }
}
`

  const preloadJs = `// 插件 preload: require('./lib.js') 的相对路径解析到插件目录
var lib = require('./lib.js')

// 在 window 上挂载, 供 page.html 的 <script> 访问
window.formatColor = lib.formatColor
window.preloadDir = __dirname
`

  const pageHtml = '<!DOCTYPE html>\n<html lang="zh">\n<head><meta charset="UTF-8"><style>\n' +
    '  *{margin:0;padding:0;box-sizing:border-box}\n' +
    '  body{font-family:system-ui;background:#1e1e2e;color:#cdd6f4;display:flex;flex-direction:column;align-items:center;padding:24px;min-height:100vh}\n' +
    '  h1{font-size:20px;margin-bottom:4px}\n' +
    '  .subtitle{font-size:11px;color:#6c7086;margin-bottom:20px}\n' +
    '  .card{background:#181825;border:1px solid #45475a;border-radius:8px;padding:16px 24px;width:100%;max-width:400px;margin-bottom:12px}\n' +
    '  .card-title{font-size:11px;color:#6c7086;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px}\n' +
    '  .card-value{font-size:20px;font-weight:600}\n' +
    '  .info{margin-top:16px;font-size:12px;color:#6c7086;text-align:center;line-height:2}\n' +
    '  code{background:#313244;padding:1px 8px;border-radius:3px;font-size:11px}\n' +
    '</style></head>\n<body>\n' +
    '  <h1>多文件 WebView 测试</h1>\n' +
    '  <div class="subtitle"><code>htmlPath</code> + <code>preload</code> + 共享 <code>lib.js</code></div>\n' +
    '  <div class="card">\n' +
    '    <div class="card-title">futariWeb 实时输入</div>\n' +
    '    <div class="card-value" id="out" style="color:#f5c2e7">等待输入...</div>\n' +
    '  </div>\n' +
    '  <div class="card">\n' +
    '    <div class="card-title">window.formatColor (来自 preload → lib.js)</div>\n' +
    '    <div class="card-value" id="color-demo">-</div>\n' +
    '  </div>\n' +
    '  <div class="card">\n' +
    '    <div class="card-title">shared.formatColor (来自 &lt;script src="./lib.js"&gt;)</div>\n' +
    '    <div class="card-value" id="color-html" style="color:#98c379">-</div>\n' +
    '  </div>\n' +
    '  <div class="info">\n' +
    '    <p><code>preload.js</code>: <code>require("./lib.js")</code> → 挂载 <code>window.formatColor</code></p>\n' +
    '    <p><code>page.html</code>: <code>&lt;script src="./lib.js"&gt;</code> → 全局 <code>formatColor</code></p>\n' +
    '    <p>两者共享同一份 <code>lib.js</code></p>\n' +
    '  </div>\n' +
    '  <script src="./lib.js"></script>\n' +
    '  <script>\n' +
    '    var out = document.getElementById("out")\n' +
    '    var colorDemo = document.getElementById("color-demo")\n' +
    '    var colorHtml = document.getElementById("color-html")\n' +
    '    window.futariWeb.onSubInputChange(function(text) {\n' +
    '      out.textContent = text || "(空)"\n' +
    '      var color = text && text.trim().toLowerCase() || ""\n' +
    '      var hex = formatColor(color)\n' +
    '      colorDemo.style.color = hex\n' +
    '      colorDemo.textContent = hex\n' +
    '      colorHtml.style.color = window.formatColor ? window.formatColor(color) : "#abb2bf"\n' +
    '      colorHtml.textContent = window.formatColor ? window.formatColor(color) : "(preload 未就绪)"\n' +
    '    })\n' +
    '  </script>\n' +
    '</body></html>'

  writeFileSync(join(dir, 'lib.js'), libJs, 'utf-8')
  writeFileSync(join(dir, 'preload.js'), preloadJs, 'utf-8')
  writeFileSync(join(dir, 'page.html'), pageHtml, 'utf-8')

  return { dir, htmlPath: join(dir, 'page.html'), preloadPath: join(dir, 'preload.js') }
}

const helloPlugin: IPlugin = {
  id: 'hello',
  name: 'Hello',
  icon: '\u{1F44B}',
  prefix: 'hi',

  async onActivate() {},
  async onDeactivate() {},

  shouldAutoActivate(appInfo: AppInfo): boolean {
      console.log(appInfo.name)
    return appInfo.name.toLowerCase().includes('notepad')
  },

  async buildCommands() {
    return [{
      id: 'greet',
      name: '打招呼',
      icon: '\u{1F44B}',
      match(input: string): CommandMatch | null {
        const name = input.trim()
        if (!name) {
          return { preview: '输入你的名字打招呼', priority: 10 }
        }
        return { preview: `向 ${name} 打招呼`, priority: 10 }
      },
      execute(ctx: CommandContext): void {
        const name = ctx.input.trim() || '世界'
        ctx.toast(`你好，${name}！\u{1F44B}`)
      }
    }, {
      id: 'bye',
      name: '说再见',
      icon: '\u{1F44B}',
      match(input: string): CommandMatch | null {
        if (input.trim() && input.trim() !== 'bye') return null
        return { preview: '和所有人说再见', priority: 5 }
      },
      execute(ctx: CommandContext): void {
        ctx.toast('再见！\u{1F44B}')
      }
    }, {
      id: 'web-test',
      name: '测试 Web View',
      icon: '\u{1F310}',
      match(_input: string): CommandMatch | null {
        return { preview: '打开一个测试网页，实时显示搜索框输入', priority: 8 }
      },
      execute(ctx: CommandContext): void {
        ctx.openWebView({
          html: `<!DOCTYPE html>
<html lang="zh">
<head><meta charset="UTF-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:system-ui;background:#1e1e2e;color:#cdd6f4;display:flex;flex-direction:column;align-items:center;padding:24px;height:100vh}
  h1{font-size:20px;margin-bottom:8px}
  .badge{font-size:11px;color:#a6adc8;background:#313244;padding:2px 8px;border-radius:4px;margin-bottom:20px}
  .input-display{background:#181825;border:1px solid #45475a;border-radius:8px;padding:16px 24px;min-height:60px;font-size:24px;color:#f5c2e7;text-align:center;min-width:280px}
  .info{margin-top:20px;font-size:12px;color:#6c7086;text-align:center;line-height:1.8}
  code{background:#313244;padding:1px 6px;border-radius:3px;font-size:11px}
</style></head>
<body>
  <h1>Futari Web View</h1>
  <div class="badge">futariWeb API 测试</div>
  <div class="input-display" id="out">等待输入...</div>
  <div class="info">
    <p>在搜索框输入文字，这里会实时更新</p>
    <p>试试 <code>window.futariWeb</code> API</p>
  </div>
  <script>
    var out = document.getElementById('out')
    window.futariWeb.onSubInputChange(function(text) {
      out.textContent = text || '(空)'
    })
  </script>
</body></html>`,
          height: 340
        })
      }
    }, {
      id: 'web-test-multi',
      name: '测试多文件 WebView',
      icon: '\u{1F4E6}',
      match(_input: string): CommandMatch | null {
        return { preview: 'htmlPath + preload + 共享 lib.js — 演示分文件开发', priority: 7 }
      },
      async execute(ctx: CommandContext): Promise<void> {
        const { htmlPath, preloadPath } = setupMultiFileTest()
        const result = await ctx.openWebView({
          htmlPath,
          preload: preloadPath,
          height: 480,
          injectBaseStyles: true
        })
        ctx.toast('多文件 WebView 已关闭' + (result ? ': ' + JSON.stringify(result) : ''))
      }
    }]
  },

  async getFallbackCommands() {
    return [{
      id: 'hello-fallback',
      name: '说你好',
      description: '直接在主输入框说你好',
      icon: '\u{1F44B}',
      matches(input: string): boolean {
        return input === 'hello' || input === '你好'
      },
      build(_input: string) {
        return {
          id: 'hello-fallback',
          name: '说你好',
          icon: '\u{1F44B}',
          match(): CommandMatch {
            return { preview: '你好，世界！', priority: 10 }
          },
          execute(ctx: CommandContext): void {
            ctx.toast('你好，世界！\u{1F44B}')
          }
        }
      }
    }]
  }
}

export default helloPlugin
