import type { IPlugin, CommandMatch, CommandContext, AppInfo } from '../../shared/plugin-api'

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
