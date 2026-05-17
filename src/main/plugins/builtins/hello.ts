import type { IPlugin, CommandMatch, CommandContext, AppInfo } from '@shared/plugin-api'

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
