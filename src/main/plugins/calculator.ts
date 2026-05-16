import type { IPlugin, CommandMatch, CommandContext, CommandResult } from '../../shared/plugin-api'

function safeEval(expr: string): string {
  const sanitized = expr.replace(/[^0-9+\-*/().%\s]/g, '').trim()
  if (!sanitized) return ''
  const result = Function('"use strict"; return (' + sanitized + ')')()
  if (typeof result === 'number') {
    return Number.isInteger(result) ? String(result) : result.toFixed(6).replace(/\.?0+$/, '')
  }
  return ''
}

const calculatorPlugin: IPlugin = {
  id: 'calculator',
  name: '计算器',
  icon: '\u{1F522}',
  prefix: '=',

  async onActivate() {},
  async onDeactivate() {},

  async buildCommands() {
    return [{
      id: 'calc',
      name: '计算结果',
      icon: '\u{1F522}',
      match(input: string): CommandMatch | null {
        const trimmed = input.trim()
        if (!trimmed) {
          return { preview: '输入表达式进行计算 (例: 2+3*4)', priority: 10 }
        }
        const result = safeEval(trimmed)
        if (!result) {
          return { preview: `无法计算: ${trimmed}`, priority: 1 }
        }
        return { preview: `= ${result}`, priority: 10 }
      },
      async execute(ctx: CommandContext): Promise<CommandResult> {
        const result = safeEval(ctx.input.trim())
        if (!result) {
          return { type: 'toast', message: '无法计算此表达式' }
        }
        return { type: 'toast', message: `${ctx.input.trim()} = ${result}` }
      }
    }]
  },

  async getFallbackCommands() {
    return []
  }
}

export default calculatorPlugin
