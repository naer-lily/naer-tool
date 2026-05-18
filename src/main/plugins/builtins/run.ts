import { staticCommands } from '@shared/plugin-api'
import { exec } from 'child_process'
import type { IPlugin, CommandContext } from '@shared/plugin-api'

const runPlugin: IPlugin = {
  id: 'run',
  name: '运行命令',
  icon: '\u{1F4BB}',
  prefix: '>',

  async onActivate() {},
  async onDeactivate() {},

  buildCommands: staticCommands([{
    id: 'run-cmd',
    name: '运行命令',
    icon: '\u{1F4BB}',
    match(input: string) {
      const trimmed = input.trim()
      if (!trimmed) {
        return { preview: '输入命令并运行 (例: notepad)' }
      }
      return { preview: `运行: ${trimmed}` }
    },
    execute(ctx: CommandContext): void {
      const cmd = ctx.input.trim()
      if (!cmd) {
        ctx.toast('请输入命令')
        return
      }
      exec(cmd, { timeout: 10000 }, (error, stdout, stderr) => {
        if (error) {
          ctx.toast(`错误: ${error.message.slice(0, 80)}`)
          return
        }
        const output = (stdout || stderr).trim().slice(0, 120)
        ctx.toast(output || '命令已执行 (无输出)')
      })
    }
  }]),

  async getFallbackCommands() {
    return []
  }
}

export default runPlugin
