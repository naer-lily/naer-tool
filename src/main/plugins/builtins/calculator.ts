import { staticCommands } from '@shared/plugin-api'
import type { IPlugin, CommandContext } from '@shared/plugin-api'

function safeEval(expr: string): string {
  const sanitized = expr.replace(/[^0-9+\-*/().%\s]/g, '').trim()
  if (!sanitized || !/[0-9]/.test(sanitized)) return ''
  try {
    const result = Function('"use strict"; return (' + sanitized + ')')()
    if (typeof result === 'number' && Number.isFinite(result)) {
      return Number.isInteger(result) ? String(result) : result.toFixed(6).replace(/\.?0+$/, '')
    }
    return ''
  } catch {
    return ''
  }
}

const calculatorPlugin: IPlugin = {
  id: 'calculator',
  name: '计算器',
  icon: '\u{1F522}',
  prefix: '=',

  async onActivate() {},
  async onDeactivate() {},

  buildCommands: staticCommands([{
    id: 'calc',
    name: '计算结果',
    icon: '\u{1F522}',
    match(input: string) {
      const trimmed = input.trim()
      if (!trimmed) {
        return { preview: '输入表达式进行计算 (例: 2+3*4)' }
      }
      const result = safeEval(trimmed)
      if (!result) {
        return { preview: `无法计算: ${trimmed}` }
      }
      return { preview: `${result} = ${trimmed}` }
    },
    execute(ctx: CommandContext): void {
      const result = safeEval(ctx.input.trim())
      if (!result) {
        ctx.toast('无法计算此表达式')
        return
      }
      ctx.toast(`${ctx.input.trim()} = ${result}`)
    }
  }]),

  async getFallbackCommands() {
    return []
  }
}

export default calculatorPlugin
