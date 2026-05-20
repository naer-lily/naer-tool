import { spawn, execSync } from 'child_process'
import { app } from 'electron'
import { join } from 'path'
import * as iconv from 'iconv-lite'
import type { IPlugin, ICommand, PluginContext, CommandContext, CommandOutcome } from '@shared/plugin-api'
import { logger } from '@main/logger'

const ES_PATH = join(app.getAppPath(), 'resources', 'es.exe')

function detectSystemEncoding(): string {
  try {
    const out = execSync('chcp.com', { encoding: 'utf-8', timeout: 3000 }).toString()
    const match = out.match(/(\d+)/)
    if (match) {
      const cp = parseInt(match[1], 10)
      const map: Record<number, string> = {
        936: 'gbk',
        950: 'big5',
        932: 'shift_jis',
        949: 'euc-kr',
        65001: 'utf8'
      }
      if (map[cp]) return map[cp]
      if (cp >= 1250 && cp <= 1258) return `win${cp}`
    }
  } catch { /* ignore */ }
  return 'utf8'
}

const systemEncoding = detectSystemEncoding()
logger.info('[everything] detected system encoding: %s', systemEncoding)

let pendingTimer: ReturnType<typeof setTimeout> | null = null
let pendingReject: ((reason?: unknown) => void) | null = null

async function searchEverything(input: string): Promise<string[]> {
  if (pendingTimer) {
    clearTimeout(pendingTimer)
    if (pendingReject) pendingReject(new Error('aborted'))
  }
  return new Promise((resolve, reject) => {
    pendingReject = reject
    pendingTimer = setTimeout(() => {
      pendingTimer = null
      pendingReject = null
      const queryArgs = input.trim().split(/\s+/).filter(Boolean)
      const args = ['-n', '20', '-double-quote', '-sort', 'dm', ...queryArgs]
      const child = spawn(ES_PATH, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      })
      const chunks: Buffer[] = []
      child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
      let stderr = ''
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf-8') })
      const timeout = setTimeout(() => {
        child.kill()
        resolve([])
      }, 5000)
      child.on('error', (err) => {
        clearTimeout(timeout)
        logger.debug('[everything] spawn error: %s', err.message)
        resolve([])
      })
      child.on('close', (code) => {
        clearTimeout(timeout)
        if (code !== 0 && code !== 9) {
          if (stderr) logger.debug('[everything] es.exe stderr: %s', stderr)
          resolve([])
          return
        }
        const raw = Buffer.concat(chunks)
        const text = systemEncoding === 'utf8' ? raw.toString('utf8') : iconv.decode(raw, systemEncoding)
        const lines = text.trim().split('\r\n').filter(Boolean)
        resolve(lines.map(l => l.replace(/^"|"$/g, '')))
      })
    }, 150)
  })
}

function getFileName(filePath: string): string {
  const idx = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  return idx >= 0 ? filePath.slice(idx + 1) : filePath
}

const everythingPlugin: IPlugin = {
  id: 'everything',
  name: 'Everything 搜索',
  icon: '🔍',
  prefix: 'ea',

  async onActivate() {
    logger.info('[everything] es.exe path: %s', ES_PATH)
  },
  async onDeactivate() {},

  async buildCommands(_ctx: PluginContext, input: string): Promise<ICommand[]> {
    const trimmed = input.trim()
    if (!trimmed) {
      return [{
        id: 'ea-placeholder',
        name: 'Everything 搜索',
        icon: '🔍',
        preview: '输入关键词搜索文件...',
        async execute(ctx: CommandContext): Promise<CommandOutcome | void> {
          ctx.toast('请输入搜索关键词')
        }
      }]
    }

    const files = await searchEverything(trimmed)

    if (files.length === 0) {
      return [{
        id: 'ea-empty',
        name: '无结果',
        icon: '🔍',
        preview: `没有匹配 "${trimmed}" 的文件`,
        async execute(ctx: CommandContext): Promise<CommandOutcome | void> {
          ctx.toast('没有找到匹配的文件')
        }
      }]
    }

    const commands: ICommand[] = files.map(filePath => ({
      id: encodeURIComponent(filePath),
      name: getFileName(filePath),
      icon: '📄',
      preview: filePath,
      contextMenu: [
        { id: 'open-file', label: '打开文件', icon: '📄' },
        { separator: true },
        { id: 'open-folder', label: '打开所在文件夹', icon: '📂' },
        { id: 'copy-path', label: '复制文件路径', icon: '📋' },
        { id: 'copy-name', label: '复制文件名', icon: '📝' }
      ],
      async execute(ctx: CommandContext): Promise<CommandOutcome | void> {
        const err = await ctx.shell.openPath(filePath)
        if (err) {
          ctx.toast(`打开失败: ${err}`)
        }
      }
    }))

    return commands
  },

  async getFallbackCommands() {
    return []
  },

  async onContextAction(commandId: string, actionId: string, ctx: CommandContext): Promise<void> {
    const filePath = decodeURIComponent(commandId)
    switch (actionId) {
      case 'open-file':
        void ctx.shell.openPath(filePath)
        break
      case 'open-folder':
        ctx.shell.showItemInFolder(filePath)
        break
      case 'copy-path':
        ctx.clipboard.writeText(filePath)
        ctx.toast('已复制路径')
        break
      case 'copy-name':
        ctx.clipboard.writeText(getFileName(filePath))
        ctx.toast('已复制文件名')
        break
    }
  }
}

export default everythingPlugin
