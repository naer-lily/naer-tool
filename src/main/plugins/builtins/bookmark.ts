import { spawn } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { IPlugin, ICommand, PluginContext, CommandContext, CommandOutcome } from '@shared/plugin-api'
import { logger } from '@main/logger'

interface Bookmark {
  id: string
  name: string
  type: 'url' | 'file' | 'cmd'
  path: string
  args?: string[]
  icon?: string
  runCount: number
  createdAt: number
}

const DATA_DIR = join(homedir(), '.futari')
const BOOKMARKS_PATH = join(DATA_DIR, 'bookmarks.json')
const ADD_BOOKMARK_ID = '__add_bookmark__'

const TYPE_ICONS: Record<string, string> = {
  url: '\u{1F310}',
  file: '\u{1F4C1}',
  cmd: '\u{26A1}'
}

let store: Bookmark[] = []
let idCounter = 0

function generateId(): string {
  idCounter++
  return `bm_${Date.now()}_${idCounter}`
}

function loadStore(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }
  if (!existsSync(BOOKMARKS_PATH)) {
    store = []
    saveStore()
    return
  }
  try {
    const raw = JSON.parse(readFileSync(BOOKMARKS_PATH, 'utf-8'))
    store = Array.isArray(raw) ? raw : (raw?.bookmarks || [])
    logger.info('[bookmark] loaded %d bookmarks', store.length)
  } catch (e) {
    logger.error('[bookmark] failed to parse bookmarks:', e)
    store = []
  }
}

function saveStore(): void {
  try {
    writeFileSync(BOOKMARKS_PATH, JSON.stringify(store, null, 2), 'utf-8')
  } catch (e) {
    logger.error('[bookmark] failed to save bookmarks:', e)
  }
}

function fuzzyMatch(pattern: string, target: string): boolean {
  if (!pattern) return true
  pattern = pattern.toLowerCase()
  target = target.toLowerCase()
  let pi = 0
  for (let ti = 0; ti < target.length && pi < pattern.length; ti++) {
    if (target[ti] === pattern[pi]) pi++
  }
  return pi === pattern.length
}

function parseArgs(raw: string): string[] {
  return raw.trim().split(/\s+/).filter(Boolean)
}

function formatArgs(args?: string[]): string {
  if (!args || args.length === 0) return ''
  return args.join(' ')
}

async function openBookmark(bm: Bookmark, ctx: CommandContext): Promise<string | void> {
  switch (bm.type) {
    case 'url': {
      await ctx.shell.openExternal(bm.path)
      return
    }
    case 'file': {
      const err = await ctx.shell.openPath(bm.path)
      if (err) {
        ctx.toast(`打开失败: ${err}`)
      }
      return
    }
    case 'cmd': {
      spawn(bm.path, bm.args || [], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      }).unref()
      return
    }
  }
}

function buildBookmarkCommand(bm: Bookmark): ICommand {
  return {
    id: bm.id,
    name: bm.name,
    icon: bm.icon || TYPE_ICONS[bm.type],
    preview: bm.type === 'cmd'
      ? `${bm.path} ${formatArgs(bm.args)}`
      : bm.path,
    contextMenu: [
      { id: 'edit', label: '编辑', icon: '\u270F\uFE0F' },
      { id: 'delete', label: '删除', icon: '\u{1F5D1}\uFE0F' },
      { separator: true },
      { id: 'copy-path', label: '复制路径', icon: '\u{1F4CB}' },
      ...(bm.type === 'file' ? [{ id: 'open-folder', label: '打开所在文件夹', icon: '\u{1F4C2}' }] : [])
    ],
    async execute(ctx: CommandContext): Promise<CommandOutcome | void> {
      const entry = store.find(s => s.id === bm.id)
      if (entry) { entry.runCount++; saveStore() }
      await openBookmark(bm, ctx)
    }
  }
}

async function showAddForm(ctx: CommandContext, prefill?: Partial<Bookmark>): Promise<Record<string, unknown> | null> {
  const isEdit = !!prefill
  return ctx.showForm({
    title: isEdit ? '编辑书签' : '添加书签',
    width: 460,
    fields: [
      { type: 'input', key: 'name', label: '名称', defaultValue: prefill?.name || ctx.input.trim() || '', placeholder: '书签名称', required: true },
      { type: 'select', key: 'type', label: '类型', defaultValue: prefill?.type || 'url', options: [
        { label: 'URL', value: 'url' },
        { label: '文件', value: 'file' },
        { label: '命令', value: 'cmd' }
      ]},
      { type: 'input', key: 'path', label: '路径', defaultValue: prefill?.path || '', placeholder: 'https://... 或 文件路径 或 命令', required: true },
      { type: 'input', key: 'args', label: '参数（空格分隔）', defaultValue: formatArgs(prefill?.args), placeholder: 'arg1 arg2' },
      { type: 'input', key: 'icon', label: '图标（emoji，可选）', defaultValue: prefill?.icon || '', placeholder: '\u{1F4D1}' }
    ]
  })
}

async function handleAdd(ctx: CommandContext): Promise<void> {
  const result = await showAddForm(ctx)
  if (!result) {
    ctx.toast('已取消')
    return
  }

  const name = String(result.name || '').trim()
  const type = (String(result.type || 'url')).trim() as Bookmark['type']
  const path = String(result.path || '').trim()
  const argsRaw = String(result.args || '').trim()
  const icon = String(result.icon || '').trim()

  if (!name) { ctx.toast('名称不能为空'); return }
  if (!path) { ctx.toast('路径不能为空'); return }
  if (type !== 'url' && type !== 'file' && type !== 'cmd') {
    ctx.toast('无效的类型')
    return
  }

  const bm: Bookmark = {
    id: generateId(),
    name,
    type,
    path,
    args: argsRaw ? parseArgs(argsRaw) : undefined,
    icon: icon || undefined,
    runCount: 0,
    createdAt: Date.now()
  }
  store.push(bm)
  saveStore()
  ctx.toast(`已添加书签: ${name}`)
  logger.info('[bookmark] added: name=%s type=%s', name, type)
}

async function handleEdit(bm: Bookmark, ctx: CommandContext): Promise<void> {
  const result = await showAddForm(ctx, bm)
  if (!result) {
    ctx.toast('已取消')
    return
  }

  const name = String(result.name || '').trim()
  const type = (String(result.type || 'url')).trim() as Bookmark['type']
  const path = String(result.path || '').trim()
  const argsRaw = String(result.args || '').trim()
  const icon = String(result.icon || '').trim()

  if (!name) { ctx.toast('名称不能为空'); return }
  if (!path) { ctx.toast('路径不能为空'); return }

  Object.assign(bm, {
    name,
    type,
    path,
    args: argsRaw ? parseArgs(argsRaw) : undefined,
    icon: icon || undefined
  })
  saveStore()
  ctx.toast(`已更新书签: ${name}`)
}

const bookmarkPlugin: IPlugin = {
  id: 'bookmark',
  name: '书签',
  icon: '\u{1F4D1}',
  prefix: '$',

  async onActivate() {
    loadStore()
    logger.info('[bookmark] activated, %d bookmarks loaded', store.length)
  },

  async onDeactivate() {},

  async buildCommands(_ctx: PluginContext, input: string): Promise<ICommand[]> {
    const trimmed = input.trim()

    if (!trimmed) {
      const sorted = [...store].sort((a, b) => (b.runCount - a.runCount) || a.name.localeCompare(b.name))
      const addCmd: ICommand = {
        id: ADD_BOOKMARK_ID,
        name: '添加书签...',
        icon: '\u2795',
        preview: '打开表单添加新书签',
        async execute(ctx: CommandContext): Promise<void> {
          await handleAdd(ctx)
        }
      }
      return [addCmd, ...sorted.map(buildBookmarkCommand)]
    }

    const isAddIntent = ['add', '添加', '新建', 'new', 'create'].includes(trimmed.toLowerCase())
    if (isAddIntent) {
      return [{
        id: ADD_BOOKMARK_ID,
        name: '添加书签...',
        icon: '\u2795',
        preview: '打开表单添加新书签',
        async execute(ctx: CommandContext): Promise<void> {
          await handleAdd(ctx)
        }
      }]
    }

    const matched = store
      .filter(b => fuzzyMatch(trimmed, b.name))
      .sort((a, b) => (b.runCount - a.runCount) || a.name.localeCompare(b.name))

    if (matched.length === 0) {
      return [{
        id: 'no-match',
        name: '无匹配书签',
        icon: '\u{1F4D1}',
        preview: `没有匹配 "${trimmed}" 的书签，按 Enter 添加`,
        async execute(ctx: CommandContext): Promise<void> {
          await handleAdd(ctx)
        }
      }]
    }

    return matched.map(buildBookmarkCommand)
  },

  async getFallbackCommands(_ctx: PluginContext, input: string): Promise<ICommand[]> {
    const t = input.toLowerCase().trim()
    if (!t) return []
    const keywords = ['bookmark', '书签', 'bm']
    const matched = keywords.some(kw => kw.includes(t) || t.includes(kw))
    if (!matched) return []
    return [{
      id: 'add-bookmark-fallback',
      name: '添加书签',
      icon: '\u{1F4D1}',
      preview: `输入 $ 管理书签，或在此处按 Enter 添加`,
      async execute(ctx: CommandContext): Promise<void> {
        await handleAdd(ctx)
      }
    }]
  },

  async onContextAction(commandId: string, actionId: string, ctx: CommandContext): Promise<void> {
    const bm = store.find(b => b.id === commandId)
    if (!bm) {
      ctx.toast('书签不存在')
      return
    }

    switch (actionId) {
      case 'edit':
        await handleEdit(bm, ctx)
        break
      case 'delete': {
        const idx = store.indexOf(bm)
        store.splice(idx, 1)
        saveStore()
        ctx.toast(`已删除书签: ${bm.name}`)
        logger.info('[bookmark] deleted: id=%s name=%s', bm.id, bm.name)
        break
      }
      case 'copy-path':
        ctx.clipboard.writeText(bm.path)
        ctx.toast('已复制路径')
        break
      case 'open-folder':
        ctx.shell.showItemInFolder(bm.path)
        break
    }
  }
}

export default bookmarkPlugin
