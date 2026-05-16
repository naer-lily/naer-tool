import { exec } from 'child_process'
import type { IPlugin, CommandMatch, CommandContext, CommandResult } from '../../shared/plugin-api'

const runPlugin: IPlugin = {
  id: 'run',
  name: '运行命令',
  icon: '\u{1F4BB}',
  prefix: '>',

  async onActivate() {},
  async onDeactivate() {},

  async buildCommands() {
    return [{
      id: 'run-cmd',
      name: '运行命令',
      icon: '\u{1F4BB}',
      match(input: string): CommandMatch | null {
        const trimmed = input.trim()
        if (!trimmed) {
          return { preview: '输入命令并运行 (例: notepad)', priority: 10 }
        }
        return { preview: `运行: ${trimmed}`, priority: 10 }
      },
      async execute(ctx: CommandContext): Promise<CommandResult> {
        const cmd = ctx.input.trim()
        if (!cmd) {
          return { type: 'toast', message: '请输入命令' }
        }
        return new Promise<CommandResult>((resolve) => {
          exec(cmd, { timeout: 10000 }, (error, stdout, stderr) => {
            if (error) {
              resolve({ type: 'toast', message: `错误: ${error.message.slice(0, 80)}` })
              return
            }
            const output = (stdout || stderr).trim().slice(0, 120)
            resolve({ type: 'toast', message: output || '命令已执行 (无输出)' })
          })
        })
      }
    }]
  },

  async getFallbackCommands() {
    return []
  }
}

export default runPlugin
