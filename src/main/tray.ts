import { app, Tray, Menu, nativeImage, NativeImage } from 'electron'
import { toggleWindow, getMainWindow } from '@main/window-manager'

let tray: Tray | null = null

function createTrayIcon(): NativeImage {
  const size = 16
  const buf = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - size / 2 + 0.5
      const dy = y - size / 2 + 0.5
      if (dx * dx + dy * dy < (size / 2 - 1) ** 2) {
        const offset = (y * size + x) * 4
        buf[offset] = 210
        buf[offset + 1] = 110
        buf[offset + 2] = 50
        buf[offset + 3] = 255
      }
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size })
}

export function createTray(): void {
  tray = new Tray(createTrayIcon())
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
