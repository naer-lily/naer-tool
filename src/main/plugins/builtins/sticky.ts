import { BrowserWindow, app, ipcMain, dialog, screen } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { IPlugin, ICommand, PluginContext, CommandContext, CommandOutcome } from '@shared/plugin-api'
import { configManager } from '@main/config'
import { logger } from '@main/logger'

interface StickyNoteData {
  id: string
  content: string
  x: number
  y: number
  width: number
  height: number
  stayOnTop: boolean
  groupId: number
  color: number
  opacity: number
  locked: boolean
  createdAt: number
  updatedAt: number
}

const DATA_DIR = join(homedir(), '.futari')
const STORE_PATH = join(DATA_DIR, 'sticky-notes.json')

let store: StickyNoteData[] = []
const windows = new Map<string, BrowserWindow>()
let currentGroup = 1
let groupVisible = true

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }
}

function loadStore(): void {
  ensureDataDir()
  if (!existsSync(STORE_PATH)) {
    store = []
    return
  }
  try {
    const raw = JSON.parse(readFileSync(STORE_PATH, 'utf-8'))
    store = Array.isArray(raw) ? raw : []
    for (const n of store) {
      if (n.color === undefined) n.color = 0
      if (n.opacity === undefined) n.opacity = 1.0
      if (n.locked === undefined) n.locked = false
    }
    logger.info('[sticky] loaded %d notes', store.length)
  } catch (e) {
    logger.error('[sticky] failed to parse store:', e)
    store = []
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

function saveStore(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8')
    } catch (e) {
      logger.error('[sticky] failed to save store:', e)
    }
  }, 300)
}

function saveStoreNow(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = null
  try {
    writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8')
  } catch (e) {
    logger.error('[sticky] failed to save store:', e)
  }
}

function generateId(): string {
  return `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function getDefaultPosition(offset = 0): { x: number; y: number } {
  const display = screen.getPrimaryDisplay()
  const { x, y, width, height } = display.workArea
  const baseX = x + Math.floor(width / 2) - 150 + offset * 30
  const baseY = y + Math.floor(height / 2) - 125 + offset * 30
  return { x: baseX, y: baseY }
}

function createNoteWindow(note: StickyNoteData, startEdit = false): BrowserWindow {
  const existing = windows.get(note.id)
  if (existing && !existing.isDestroyed()) {
    existing.show()
    existing.focus()
    return existing
  }

  const win = new BrowserWindow({
    width: note.width,
    height: note.height,
    x: note.x,
    y: note.y,
    frame: false,
    transparent: false,
    backgroundColor: '#2d2d2d',
    alwaysOnTop: true,
    resizable: !note.locked,
    skipTaskbar: true,
    hasShadow: true,
    webPreferences: {
      sandbox: false,
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  win.setMinimumSize(200, 150)
  win.setOpacity(note.opacity ?? 1.0)

  const htmlPath = join(app.getAppPath(), 'resources', 'sticky-note.html')
  win.loadURL(`file:///${htmlPath}`).catch(e =>
    logger.error('[sticky] failed to load note window:', e)
  )

  win.webContents.on('context-menu', (e, params) => {
    e.preventDefault()
    win.webContents.executeJavaScript(`
      if (window.__showStickyContextMenu) window.__showStickyContextMenu(${params.x}, ${params.y})
    `).catch(() => {})
  })

  win.webContents.on('did-finish-load', () => {
    const theme = configManager.getTheme()
    win.webContents.executeJavaScript(`
      window.__initStickyNote(${JSON.stringify({ ...note, startEdit, theme })})
    `).catch(e => logger.error('[sticky] failed to inject data:', e))
  })

  let moveTimer: ReturnType<typeof setTimeout> | null = null
  win.on('moved', () => {
    if (win.isDestroyed()) return
    const b = win.getBounds()
    const idx = store.findIndex(n => n.id === note.id)
    if (idx !== -1) {
      store[idx].x = b.x
      store[idx].y = b.y
      if (moveTimer) clearTimeout(moveTimer)
      moveTimer = setTimeout(() => saveStore(), 500)
    }
  })

  let resizeTimer: ReturnType<typeof setTimeout> | null = null
  win.on('resize', () => {
    if (win.isDestroyed()) return
    const b = win.getBounds()
    const idx = store.findIndex(n => n.id === note.id)
    if (idx !== -1) {
      store[idx].width = b.width
      store[idx].height = b.height
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => saveStore(), 500)
    }
  })

  win.on('closed', () => {
    windows.delete(note.id)
  })

  windows.set(note.id, win)
  return win
}

function destroyNoteWindow(id: string): void {
  const win = windows.get(id)
  if (win && !win.isDestroyed()) {
    win.close()
  }
  windows.delete(id)
  checkGroupVisibility()
}

function checkGroupVisibility(): void {
  const hasVisible = Array.from(windows.values()).some(w => {
    if (w.isDestroyed()) return false
    const note = store.find(n => n.id === getNoteIdFromWindow(w))
    return note?.groupId === currentGroup
  })
  if (!hasVisible) {
    groupVisible = false
  }
}

function getNoteIdFromWindow(win: BrowserWindow): string | undefined {
  for (const [id, w] of windows) {
    if (w === win) return id
  }
  return undefined
}

function restoreWindows(): void {
  if (!groupVisible) return
  for (const note of store) {
    if (note.groupId === currentGroup) {
      createNoteWindow(note)
    }
  }
}

function hideAllInGroup(groupId: number): void {
  for (const [id, win] of windows) {
    const note = store.find(n => n.id === id)
    if (note?.groupId === groupId) {
      win.hide()
    }
  }
}

function showAllInGroup(groupId: number): void {
  groupVisible = true
  for (const note of store) {
    if (note.groupId === groupId) {
      const win = windows.get(note.id)
      if (win && !win.isDestroyed()) {
        win.show()
        win.focus()
      } else {
        createNoteWindow(note)
      }
    }
  }
}

function switchGroup(groupId: number): void {
  hideAllInGroup(currentGroup)
  currentGroup = groupId
  groupVisible = true
  showAllInGroup(currentGroup)
}

function toggleDisplay(): void {
  if (groupVisible) {
    hideAllInGroup(currentGroup)
    groupVisible = false
  } else {
    showAllInGroup(currentGroup)
    groupVisible = true
  }
}

function destroyAllWindows(): void {
  windows.forEach((win) => {
    if (!win.isDestroyed()) win.close()
  })
  windows.clear()
}

let ipcHandlersRegistered = false

function registerIpcHandlers(): void {
  if (ipcHandlersRegistered) return
  ipcHandlersRegistered = true

  ipcMain.on('sticky:save', (_event, { id, content }: { id: string; content: string }) => {
    const note = store.find(n => n.id === id)
    if (note) {
      note.content = content
      note.updatedAt = Date.now()
      saveStore()
    }
  })

  ipcMain.on('sticky:close', (_event, { id }: { id: string }) => {
    destroyNoteWindow(id)
  })

  ipcMain.on('sticky:delete', (_event, { id }: { id: string }) => {
    destroyNoteWindow(id)
    const idx = store.findIndex(n => n.id === id)
    if (idx !== -1) {
      store.splice(idx, 1)
      saveStore()
    }
  })

  ipcMain.on('sticky:set-color', (_event, { id, color }: { id: string; color: number }) => {
    const note = store.find(n => n.id === id)
    if (note) {
      note.color = color
      saveStore()
    }
  })

  ipcMain.on('sticky:set-opacity', (_event, { id, opacity }: { id: string; opacity: number }) => {
    const note = store.find(n => n.id === id)
    if (note) {
      note.opacity = opacity
      const win = windows.get(id)
      if (win && !win.isDestroyed()) {
        win.setOpacity(opacity)
      }
      saveStore()
    }
  })

  ipcMain.on('sticky:set-lock', (_event, { id, locked }: { id: string; locked: boolean }) => {
    const note = store.find(n => n.id === id)
    if (note) {
      note.locked = locked
      const win = windows.get(id)
      if (win && !win.isDestroyed()) {
        win.setResizable(!locked)
      }
      saveStore()
    }
  })

  ipcMain.on('sticky:duplicate', (_event, { id, content }: { id: string; content: string }) => {
    const original = store.find(n => n.id === id)
    if (!original) return
    const offset = windows.size
    const pos = getDefaultPosition(offset)
    const dup: StickyNoteData = {
      id: generateId(),
      content: content,
      x: pos.x,
      y: pos.y,
      width: original.width,
      height: original.height,
      stayOnTop: original.stayOnTop,
      groupId: currentGroup,
      color: original.color,
      opacity: original.opacity ?? 1.0,
      locked: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    store.push(dup)
    saveStore()
    createNoteWindow(dup, false)
  })
}

function unregisterIpcHandlers(): void {
  ipcMain.removeAllListeners('sticky:save')
  ipcMain.removeAllListeners('sticky:close')
  ipcMain.removeAllListeners('sticky:delete')
  ipcMain.removeAllListeners('sticky:set-color')
  ipcMain.removeAllListeners('sticky:set-opacity')
  ipcMain.removeAllListeners('sticky:set-lock')
  ipcMain.removeAllListeners('sticky:duplicate')
  ipcHandlersRegistered = false
}

function onBeforeQuit(): void {
  saveStoreNow()
  destroyAllWindows()
}

function createNoteData(content: string): StickyNoteData {
  const pos = getDefaultPosition()
  return {
    id: generateId(),
    content,
    x: pos.x,
    y: pos.y,
    width: 300,
    height: 250,
    stayOnTop: true,
    groupId: currentGroup,
    color: 0,
    opacity: 0.6,
    locked: false,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
}

const plugin: IPlugin = {
  id: 'sticky',
  name: '便签',
  icon: '📝',
  prefix: 'st',

  async onActivate(_ctx: PluginContext): Promise<void> {
    ensureDataDir()
    loadStore()
    registerIpcHandlers()
    restoreWindows()
    app.on('before-quit', onBeforeQuit)
    logger.info('[sticky] activated, %d notes in store', store.length)
  },

  async onDeactivate(): Promise<void> {
    app.off('before-quit', onBeforeQuit)
    unregisterIpcHandlers()
    destroyAllWindows()
    saveStoreNow()
  },

  async buildCommands(_ctx: PluginContext, input: string): Promise<ICommand[]> {
    const subInput = input.trim().toLowerCase()
    const commands: ICommand[] = []

    for (let i = 1; i <= 5; i++) {
      const isCurrent = i === currentGroup
      const count = store.filter(n => n.groupId === i).length
      commands.push({
        id: `group-${i}`,
        name: `切换到组 ${i}`,
        icon: isCurrent ? '📂' : '📁',
        preview: `${isCurrent ? '当前组' : `切换到第 ${i} 组`} (${count} 个便签)`,
        execute: (): CommandOutcome => {
          if (i !== currentGroup) {
            switchGroup(i)
          }
          return 'close'
        }
      })
    }

    commands.push({
      id: 'toggle',
      name: groupVisible ? '隐藏便签' : '显示便签',
      icon: groupVisible ? '🙈' : '👁',
      preview: groupVisible ? '隐藏当前组所有便签' : '显示当前组所有便签',
      execute: (): CommandOutcome => {
        toggleDisplay()
        return 'close'
      }
    })

    commands.push({
      id: 'import',
      name: '导入便签',
      icon: '📥',
      preview: '从 JSON 文件导入便签',
      async execute(ctx: CommandContext): Promise<CommandOutcome> {
        const focusedWin = BrowserWindow.getFocusedWindow()!
        const result = await dialog.showOpenDialog(focusedWin, {
          title: '导入便签',
          properties: ['openFile'],
          filters: [{ name: 'JSON', extensions: ['json'] }]
        })
        if (result.canceled || !result.filePaths[0]) return 'home'

        try {
          const raw = JSON.parse(readFileSync(result.filePaths[0], 'utf-8'))
          const imported = Array.isArray(raw) ? raw : []
          let count = 0
          for (const item of imported) {
            if (item.content !== undefined) {
              const posOffset = getDefaultPosition(count)
              store.push({
                id: generateId(),
                content: item.content || '',
                x: posOffset.x,
                y: posOffset.y,
                width: item.width || 300,
                height: item.height || 250,
                stayOnTop: item.stayOnTop !== false,
                groupId: currentGroup,
                color: item.color || 0,
                opacity: item.opacity ?? 1.0,
                locked: item.locked === true,
                createdAt: Date.now(),
                updatedAt: Date.now()
              })
              createNoteWindow(store[store.length - 1])
              count++
            }
          }
          saveStore()
          ctx.toast(`已导入 ${count} 个便签到第 ${currentGroup} 组`)
        } catch {
          ctx.toast('导入失败：文件格式错误')
        }
        return 'home'
      }
    })

    commands.push({
      id: 'export',
      name: '导出便签',
      icon: '📤',
      preview: '导出当前组所有便签为 JSON 文件',
      async execute(ctx: CommandContext): Promise<CommandOutcome> {
        const notesToExport = store.filter(n => n.groupId === currentGroup)
        if (notesToExport.length === 0) {
          ctx.toast('当前组没有便签可导出')
          return 'home'
        }
        const focusedWin = BrowserWindow.getFocusedWindow()!
        const result = await dialog.showSaveDialog(focusedWin, {
          title: '导出便签',
          defaultPath: `sticky-notes-group-${currentGroup}.json`,
          filters: [{ name: 'JSON', extensions: ['json'] }]
        })
        if (result.canceled || !result.filePath) return 'home'

        try {
          const exportData = notesToExport.map(n => ({
            content: n.content,
            width: n.width,
            height: n.height,
            stayOnTop: n.stayOnTop,
            color: n.color,
            opacity: n.opacity,
            locked: n.locked
          }))
          writeFileSync(result.filePath, JSON.stringify(exportData, null, 2), 'utf-8')
          ctx.toast(`已导出 ${exportData.length} 个便签`)
        } catch {
          ctx.toast('导出失败')
        }
        return 'home'
      }
    })

    commands.push({
      id: 'clear',
      name: '清空当前组',
      icon: '🗑',
      preview: `删除第 ${currentGroup} 组的全部便签`,
      execute: (ctx: CommandContext): CommandOutcome => {
        const count = store.filter(n => n.groupId === currentGroup).length
        if (count === 0) {
          ctx.toast('当前组没有便签')
          return 'close'
        }
        for (const note of store) {
          if (note.groupId === currentGroup) {
            destroyNoteWindow(note.id)
          }
        }
        store = store.filter(n => n.groupId !== currentGroup)
        saveStore()
        ctx.toast(`已删除 ${count} 个便签`)
        return 'close'
      }
    })

    commands.push({
      id: 'new',
      name: '新建便签',
      icon: '➕',
      preview: '在屏幕中央创建空白便签',
      execute: (): CommandOutcome => {
        const note = createNoteData('')
        store.push(note)
        saveStore()
        createNoteWindow(note, true)
        return 'close'
      }
    })

    if (subInput) {
      return commands.filter(c =>
        c.name.includes(subInput) ||
        c.id.includes(subInput)
      )
    }

    return commands
  },

  async getFallbackCommands(_ctx: PluginContext, input: string): Promise<ICommand[]> {
    const trimmed = input.trim()
    if (!trimmed) return []

    const preview = trimmed.length > 60
      ? trimmed.slice(0, 60) + '...'
      : trimmed

    return [{
      id: 'quick-capture',
      name: '创建便签',
      icon: '📝',
      preview,
      execute: (): CommandOutcome => {
        const note = createNoteData(trimmed)
        store.push(note)
        saveStore()
        createNoteWindow(note, false)
        return 'close'
      }
    }]
  }
}

export default plugin
