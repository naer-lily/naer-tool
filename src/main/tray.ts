import { app, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { toggleWindow, getMainWindow } from '@main/window-manager'

let tray: Tray | null = null

function getIconPath(): string {
  return join(app.getAppPath(), 'resources', 'icon.png')
}

export function createTray(): void {
  const icon = nativeImage.createFromPath(getIconPath()).resize({ width: 16, height: 16 })
  tray = new Tray(icon)
  tray.setToolTip('Futari')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示/隐藏', click: toggleWindow },
    { label: '切换主题', click: () => { getMainWindow()?.webContents.send('toggle-theme') } },
    { type: 'separator' },
    { label: '退出', click: () => { app.quit() } }
  ]))
  tray.on('click', toggleWindow)
}

export function destroyTray(): void {
  try {
    tray?.destroy()
  } catch { /* already destroyed */ }
  tray = null
}
