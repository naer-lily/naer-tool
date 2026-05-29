import { BrowserWindow } from 'electron'
import type { FormConfig } from '@shared/plugin-api'
import { configManager } from '@main/config'

function buildFormHtml(config: FormConfig, theme: 'light' | 'dark'): string {
  const fieldsHtml = config.fields.map(f => buildFieldHtml(f)).join('\n')

  return `<!DOCTYPE html>
<html data-theme="${theme}"><head><meta charset="utf-8"><style>
:root{--bg:#202020;--t1:#e8e8e8;--t2:#999;--bd:rgba(255,255,255,0.08);--dv:rgba(255,255,255,0.06);--hv:rgba(255,255,255,0.06);--ib:rgba(255,255,255,0.05);--opt-bg:#2a2a2a;color-scheme:dark}[data-theme="light"]{--bg:#f0f0f0;--t1:#1a1a1a;--t2:#5a5a5a;--bd:rgba(0,0,0,0.1);--dv:rgba(0,0,0,0.07);--hv:rgba(0,0,0,0.05);--ib:rgba(0,0,0,0.04);--opt-bg:#fff;color-scheme:light}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif;background:var(--bg);overflow:hidden;user-select:none}
.win{width:100vw;height:100vh;display:flex;flex-direction:column;background:var(--bg);border:1px solid var(--bd);overflow:hidden}
.title-bar{display:flex;align-items:center;justify-content:space-between;padding:0 16px;height:36px;border-bottom:1px solid var(--dv);flex-shrink:0;-webkit-app-region:drag}
.title-bar span{font-size:12px;font-weight:600;color:var(--t1)}
.title-bar button{width:24px;height:24px;border:none;background:none;color:var(--t2);font-size:16px;cursor:pointer;border-radius:4px;line-height:24px;text-align:center;-webkit-app-region:no-drag}
.title-bar button:hover{background:var(--hv);color:var(--t1)}
.body{flex:1;padding:8px 16px;overflow-y:auto;display:flex;flex-direction:column;gap:6px}
.footer{display:flex;justify-content:flex-end;gap:8px;padding:8px 16px;border-top:1px solid var(--dv);flex-shrink:0}
.footer button{padding:6px 20px;border-radius:6px;font-size:13px;cursor:pointer;border:none;font-family:inherit}
.btn-ok{background:#1677ff;color:#fff}
.btn-ok:hover{background:#4096ff}
.btn-cancel{background:var(--hv);color:var(--t1)}
.btn-cancel:hover{background:var(--bd)}
.field{display:flex;flex-direction:column;gap:3px}
.field label{font-size:11px;color:var(--t2)}
.field input,.field select,.field textarea{width:100%;padding:6px 10px;border-radius:6px;border:1px solid var(--bd);background:var(--ib);color:var(--t1);font-size:13px;font-family:inherit;outline:none}
.field input:focus,.field select:focus,.field textarea:focus{border-color:#1677ff}
.field input:disabled,.field select:disabled,.field textarea:disabled{opacity:.5}
.field select option{background:var(--opt-bg);color:var(--t1)}
.field textarea{resize:vertical;min-height:60px}
.row{display:flex;gap:8px;flex-wrap:wrap}
.chip{display:flex;align-items:center;gap:4px;font-size:12px;color:var(--t1)}
.chip input[type=checkbox],.chip input[type=radio]{accent-color:#1677ff}
.file-row{display:flex;gap:6px}
.file-row input{flex:1}
.file-row button{padding:4px 12px;border-radius:6px;border:1px solid var(--bd);background:var(--hv);color:var(--t1);font-size:12px;cursor:pointer;font-family:inherit;white-space:nowrap}
.file-row button:hover{background:var(--bd)}
.switch{position:relative;width:36px;height:20px}
.switch input{display:none}
.switch .slider{position:absolute;inset:0;background:var(--bd);border-radius:10px;cursor:pointer;transition:.2s}
.switch .slider:before{content:'';position:absolute;left:2px;top:2px;width:16px;height:16px;border-radius:50%;background:var(--t1);transition:.2s}
.switch input:checked+.slider{background:#1677ff}
.switch input:checked+.slider:before{transform:translateX(16px)}
.switch-wrap{display:flex;align-items:center;gap:8px}
.switch-wrap label{font-size:12px;color:var(--t1)}
</style></head>
<body>
<div class="win">
<div class="title-bar"><span>${escapeHtml(config.title)}</span><button onclick="window.close()">✕</button></div>
<div class="body">${fieldsHtml}</div>
<div class="footer">
<button class="btn-cancel" onclick="window.close()">取消</button>
<button class="btn-ok" onclick="submit()">确定</button>
</div>
</div>
<script>
const { ipcRenderer } = require('electron')
function submit(){
  var vals={}
${config.fields.map(f => getterJs(f)).join('\n')}
  ipcRenderer.send('form-submit',vals)
  window.close()
}
</script>
</body></html>`
}

function buildFieldHtml(f: FormConfig['fields'][0]): string {
  const l = escapeHtml(f.label)
  const p = f.placeholder ? escapeHtml(f.placeholder) : ''
  const d = f.disabled ? ' disabled' : ''
  const id = escapeAttr(f.key)

  switch (f.type) {
    case 'input':
      return `<div class="field"><label>${l}</label><input id="${id}"${d} placeholder="${p}" value="${escapeAttr(String(f.defaultValue ?? ''))}"></div>`
    case 'number':
      return `<div class="field"><label>${l}</label><input type="number" id="${id}"${d} placeholder="${p}" value="${escapeAttr(String(f.defaultValue ?? ''))}"></div>`
    case 'textarea':
      return `<div class="field"><label>${l}</label><textarea id="${id}"${d} placeholder="${p}">${escapeHtml(String(f.defaultValue ?? ''))}</textarea></div>`
    case 'select': {
      const opts = (f.options || []).map(o => {
        const sel = o.value === f.defaultValue ? ' selected' : ''
        return `<option value="${escapeAttr(o.value)}"${sel}>${escapeHtml(o.label)}</option>`
      }).join('')
      return `<div class="field"><label>${l}</label><select id="${id}"${d}>${opts}</select></div>`
    }
    case 'radio': {
      const radios = (f.options || []).map(o => {
        const chk = o.value === f.defaultValue ? ' checked' : ''
        return `<span class="chip"><input type="radio" name="${id}" value="${escapeAttr(o.value)}" id="${id}_${escapeAttr(o.value)}"${chk}${d}><label for="${id}_${escapeAttr(o.value)}">${escapeHtml(o.label)}</label></span>`
      }).join('')
      return `<div class="field"><label>${l}</label><div class="row">${radios}</div></div>`
    }
    case 'checkbox': {
      const defaultVals: string[] = Array.isArray(f.defaultValue) ? f.defaultValue : (f.defaultValue ? [String(f.defaultValue)] : [])
      const boxes = (f.options || []).map(o => {
        const chk = defaultVals.includes(o.value) ? ' checked' : ''
        return `<span class="chip"><input type="checkbox" name="${id}" value="${escapeAttr(o.value)}" id="${id}_${escapeAttr(o.value)}"${chk}${d}><label for="${id}_${escapeAttr(o.value)}">${escapeHtml(o.label)}</label></span>`
      }).join('')
      return `<div class="field"><label>${l}</label><div class="row">${boxes}</div></div>`
    }
    case 'switch':
      return `<div class="field"><label>${l}</label><span class="switch-wrap"><label class="switch"><input type="checkbox" id="${id}"${d}${f.defaultValue ? ' checked' : ''}><span class="slider"></span></label></span></div>`
    case 'file':
      return `<div class="field"><label>${l}</label><div class="file-row"><input id="${id}"${d} readonly value="${escapeAttr(String(f.defaultValue ?? ''))}"><button onclick="pickFile('${id}')">选择文件</button></div></div>`
    default:
      return `<div class="field"><label>${l}</label><input id="${id}"${d} placeholder="${p}"></div>`
  }
}

function getterJs(f: FormConfig['fields'][0]): string {
  const id = f.key

  switch (f.type) {
    case 'input':
    case 'number':
    case 'textarea':
    case 'select':
      return `  vals['${id}']=document.getElementById('${id}').value`
    case 'radio': {
      return `  var r_${id}=document.querySelector('input[name="${id}"]:checked');if(r_${id})vals['${id}']=r_${id}.value`
    }
    case 'checkbox': {
      return `  vals['${id}']=[];var cbs_${id}=document.querySelectorAll('input[name="${id}"]:checked');for(var i=0;i<cbs_${id}.length;i++)vals['${id}'].push(cbs_${id}[i].value)`
    }
    case 'switch':
      return `  vals['${id}']=!!document.getElementById('${id}').checked`
    case 'file':
      return `  vals['${id}']=document.getElementById('${id}').value`
    default:
      return `  vals['${id}']=document.getElementById('${id}')?.value || ''`
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

class FormDialogManager {
  private readonly pending = new Map<number, { resolve: (v: Record<string, unknown> | null) => void; window: BrowserWindow }>()

  async show(config: FormConfig): Promise<Record<string, unknown> | null> {
    const baseWidth = config.width || 400
    const fieldCount = config.fields.length
    const baseHeight = 130 + fieldCount * 48
    const scale = configManager.getScale()
    const theme = configManager.getTheme()
    const width = Math.round(baseWidth * scale)
    const height = Math.round(baseHeight * scale)

    const formWindow = new BrowserWindow({
      width,
      height,
      frame: false,
      transparent: false,
      backgroundColor: theme === 'light' ? '#f0f0f0' : '#202020',
      alwaysOnTop: true,
      resizable: false,
      skipTaskbar: true,
      webPreferences: {
        sandbox: false,
        nodeIntegration: true,
        contextIsolation: false
      }
    })

    formWindow.webContents.on('did-finish-load', () => {
      formWindow.webContents.setZoomFactor(scale)
    })

    const id = formWindow.webContents.id

    return new Promise((resolve) => {
      this.pending.set(id, { resolve, window: formWindow })

      formWindow.on('closed', () => {
        const entry = this.pending.get(id)
        if (entry) {
          entry.resolve(null)
          this.pending.delete(id)
        }
      })

      void formWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buildFormHtml(config, theme))}`)
    })
  }

  handleSubmit(webContentsId: number, values: Record<string, unknown>): void {
    const entry = this.pending.get(webContentsId)
    if (entry) {
      entry.resolve(values)
      this.pending.delete(webContentsId)
    }
  }

  getWindow(webContentsId: number): BrowserWindow | undefined {
    return this.pending.get(webContentsId)?.window
  }
}

export const formDialog = new FormDialogManager()
