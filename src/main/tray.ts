import { app, Tray, Menu, nativeImage, dialog } from 'electron'
import { join } from 'path'
import { toggleWindow } from '@main/window-manager'
import { showScreenToast } from '@main/toast'
import { autoUpdater } from '@main/auto-updater'
import { logger } from '@main/logger'

let tray: Tray | null = null
let baseIcon16: Electron.NativeImage
let badgedIcon16: Electron.NativeImage | null = null
let updateVersion = ''

function getIconPath(): string {
  return join(app.getAppPath(), 'resources', 'icon.png')
}

function createBadgedIcon(base: Electron.NativeImage): Electron.NativeImage {
  const size = 16
  const buf = Buffer.from(base.toBitmap())
  const cx = 12, cy = 12, r2 = 8
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy
      if (dx * dx + dy * dy <= r2) {
        const i = (y * size + x) * 4
        buf[i] = 60
        buf[i + 1] = 60
        buf[i + 2] = 255
        buf[i + 3] = 255
      }
    }
  }
  return nativeImage.createFromBuffer(buf, { width: size, height: size })
}

function rebuildMenu(): void {
  if (!tray) return
  const template: Electron.MenuItemConstructorOptions[] = [
    { label: '显示/隐藏', click: toggleWindow },
    {
      label: updateVersion ? `安装更新 ${updateVersion}` : '检查更新',
      click: () => { void handleUpdateClick() }
    },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ]
  tray.setContextMenu(Menu.buildFromTemplate(template))
}

async function handleUpdateClick(): Promise<void> {
  if (updateVersion) {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: 'Futari 更新',
      message: `是否安装 Futari ${updateVersion}？`,
      detail: `当前版本: v${app.getVersion()}\n安装完成后 Futari 将自动重启。`,
      buttons: ['安装更新', '取消'],
      defaultId: 0,
      cancelId: 1
    })
    if (response !== 0) return
    try {
      await autoUpdater.downloadAndInstall((msg) => showScreenToast(msg))
    } catch (e) {
      logger.error('[Tray] update install failed:', e)
      showScreenToast('更新失败，请稍后重试')
    }
    return
  }

  showScreenToast('正在检查更新...')
  const info = await autoUpdater.checkForUpdates()
  if (info.available && info.latestVersion) {
    updateVersion = info.latestVersion
    rebuildMenu()
    if (badgedIcon16) tray?.setImage(badgedIcon16)
    tray?.setToolTip(`Futari - 新版本 ${info.latestVersion} 可用`)
    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: 'Futari 更新',
      message: `新版本 ${info.latestVersion} 可用`,
      detail: `当前版本: v${info.currentVersion}\n是否立即安装？`,
      buttons: ['安装更新', '稍后'],
      defaultId: 0,
      cancelId: 1
    })
    if (response === 0) {
      try {
        await autoUpdater.downloadAndInstall((msg) => showScreenToast(msg))
      } catch (e) {
        logger.error('[Tray] update install failed:', e)
        showScreenToast('更新失败，请稍后重试')
      }
    }
  } else {
    await dialog.showMessageBox({
      type: 'info',
      title: 'Futari',
      message: '已是最新版本',
      detail: `当前版本: v${info.currentVersion}`
    })
  }
}

export function setUpdateAvailable(version: string): void {
  updateVersion = version
  rebuildMenu()
  if (badgedIcon16) tray?.setImage(badgedIcon16)
  tray?.setToolTip(`Futari - 新版本 ${version} 可用`)
}

export function createTray(): void {
  const iconPath = getIconPath()
  baseIcon16 = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  badgedIcon16 = createBadgedIcon(baseIcon16)

  tray = new Tray(baseIcon16)
  tray.setToolTip('Futari')
  rebuildMenu()
  tray.on('click', toggleWindow)
}

export function destroyTray(): void {
  try {
    tray?.destroy()
  } catch { /* already destroyed */ }
  tray = null
}
