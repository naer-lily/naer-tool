import { BrowserWindow, screen } from 'electron'

const WIN_WIDTH = 680
const WIN_HEIGHT = 400

let toastWindow: BrowserWindow | null = null

export function createToastWindow(): void {
  toastWindow = new BrowserWindow({
    width: 360,
    height: 40,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    show: false,
    resizable: false,
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      sandbox: false
    }
  })
  toastWindow.setIgnoreMouseEvents(true, { forward: true })
}

export function showScreenToast(message: string): void {
  if (!toastWindow) return
  const bounds = screen.getPrimaryDisplay().workArea
  const x = Math.round(bounds.x + (bounds.width - 360) / 2)
  const y = Math.round(bounds.y + bounds.height - 80)
  toastWindow.setPosition(x, y)

  toastWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(
    `<html><body style="margin:0;display:flex;justify-content:center;align-items:center;height:100vh;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif;background:transparent;overflow:hidden;">
      <div style="background:rgba(32,32,32,0.88);color:#e8e8e8;font-size:13px;padding:8px 20px;border-radius:8px;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.08);box-shadow:0 4px 16px rgba(0,0,0,0.3);white-space:nowrap;">${message.replace(/</g,'&lt;')}</div>
    </html></body>`
  )}`)

  toastWindow.show()
  setTimeout(() => {
    toastWindow?.hide()
  }, 2000)
}

export function destroyToastWindow(): void {
  toastWindow?.close()
  toastWindow = null
}
