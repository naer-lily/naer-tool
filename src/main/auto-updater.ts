import { app } from 'electron'
import { get } from 'https'
import { createWriteStream, existsSync, mkdirSync, statSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { tmpdir, homedir } from 'os'
import { execFile, spawn, type ChildProcess } from 'child_process'
import { logger } from '@main/logger'

const REPO = 'naer-lily/futari'
const API_LATEST = `https://api.github.com/repos/${REPO}/releases/latest`
const UPDATE_LOG = join(homedir(), '.futari', 'logs', 'updater.log')

export interface UpdateInfo {
  available: boolean
  currentVersion: string
  latestVersion?: string
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1
    if ((pa[i] || 0) < (pb[i] || 0)) return -1
  }
  return 0
}

async function httpGetJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = get(url, { headers: { 'User-Agent': 'futari-updater/1.0' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        httpGetJson<T>(res.headers.location).then(resolve).catch(reject)
        return
      }
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }
      let body = ''
      res.on('data', (c: Buffer) => body += c.toString())
      res.on('end', () => {
        try { resolve(JSON.parse(body)) }
        catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')) })
  })
}

async function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = get(url, { headers: { 'User-Agent': 'futari-updater/1.0' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadFile(res.headers.location, dest).then(resolve).catch(reject)
        return
      }
      const file = createWriteStream(dest)
      res.pipe(file)
      file.on('finish', () => { file.close(); resolve() })
      file.on('error', reject)
    })
    req.on('error', reject)
    req.setTimeout(300000, () => { req.destroy(); reject(new Error('download timeout')) })
  })
}

interface CachedUpdate extends UpdateInfo {
  _downloadUrl?: string
}

class AutoUpdaterManager {
  private cached: CachedUpdate | null = null
  private updating = false

  getStatus(): UpdateInfo {
    if (this.cached) return { available: this.cached.available, currentVersion: this.cached.currentVersion, latestVersion: this.cached.latestVersion }
    return { available: false, currentVersion: app.getVersion() }
  }

  async checkForUpdates(): Promise<UpdateInfo> {
    // guard: prevent concurrent update checks
    if (this.updating) {
      logger.warn('[Updater] check blocked: update already in progress')
      return { available: false, currentVersion: app.getVersion() }
    }

    const currentVersion = app.getVersion()
    logger.info('[Updater] checking for updates, current=%s', currentVersion)
    try {
      const release = await httpGetJson<{ tag_name: string; html_url: string; assets: { name: string; browser_download_url: string }[] }>(API_LATEST)
      const tagName = release.tag_name || ''
      const latestVersion = tagName.replace(/^v/, '')
      const asset = (release.assets || []).find(a => a.name.endsWith('.zip'))

      const available = compareVersions(latestVersion, currentVersion) > 0

      this.cached = {
        available,
        currentVersion,
        latestVersion: available ? `v${latestVersion}` : undefined,
        _downloadUrl: asset?.browser_download_url
      }

      logger.info('[Updater] check complete available=%s latest=%s', available, latestVersion)
      return { available, currentVersion, latestVersion: this.cached.latestVersion }
    } catch (e) {
      logger.error('[Updater] check failed:', e)
      this.cached = { available: false, currentVersion }
      return { available: false, currentVersion }
    }
  }

  async downloadAndInstall(onToast?: (msg: string) => void): Promise<void> {
    if (this.updating) {
      throw new Error('更新已在进行中')
    }

    const downloadUrl = this.cached?._downloadUrl
    if (!downloadUrl) {
      throw new Error('没有找到下载地址，请手动下载更新')
    }

    this.updating = true

    try {
      const tmpDir = join(tmpdir(), `futari-update-${Date.now()}`)
      mkdirSync(tmpDir, { recursive: true })
      const zipPath = join(tmpDir, 'update.zip')
      const extractDir = join(tmpDir, 'extracted')

      logger.info('[Updater] downloading %s', downloadUrl)
      onToast?.('正在下载更新...')

      await downloadFile(downloadUrl, zipPath)

      logger.info('[Updater] extracting')
      onToast?.('正在安装，Futari 即将重启...')

      await new Promise<void>((resolve, reject) => {
        execFile('powershell', [
          '-NoProfile', '-Command',
          `Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force`
        ], (err) => { if (err) reject(err); else resolve() })
      })

      const exePath = app.getPath('exe')
      const appDir = dirname(exePath)

      const scriptPath = join(tmpDir, 'updater.ps1')
      const script = `\
param([string]$OldDir,[string]$NewDir,[string]$Exe,[string]$LogFile,[int]$Pid)

$ErrorActionPreference = 'Stop'

function Log($msg) {
  $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff'
  try { "$ts $msg" | Out-File -FilePath $LogFile -Append -Encoding utf8 } catch {}
}

trap {
  Log "FATAL TRAP: $_"
  Log "FATAL line: $($_.InvocationInfo.ScriptLineNumber) char:$($_.InvocationInfo.OffsetInLine)"
  exit 1
}

Log "Updater started OldDir=$OldDir NewDir=$NewDir Exe=$Exe Pid=$Pid"
Start-Sleep 3
try { Wait-Process -Id $Pid -ErrorAction SilentlyContinue } catch {
  Log "Wait-Process error: $_"
}
Start-Sleep 1

$srcDir = $NewDir
$found = Get-ChildItem -Path $NewDir -Recurse -Filter 'Futari.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($found) {
  $srcDir = Split-Path $found.FullName -Parent
  Log "Found Futari.exe at $($found.FullName), srcDir=$srcDir"
} else {
  Log "ERROR: Futari.exe not found in $NewDir"
  exit 1
}

Get-ChildItem -Path "$srcDir\\*" -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
  $rel = $_.FullName.Substring($srcDir.Length + 1)
  $dst = Join-Path $OldDir $rel
  $pd = Split-Path $dst -Parent
  if (!(Test-Path $pd)) {
    try { New-Item -ItemType Directory -Path $pd -Force | Out-Null } catch {
      Log "ERROR: mkdir $pd : $_"
    }
  }
  try {
    Copy-Item $_.FullName $dst -Force -ErrorAction Stop
  } catch {
    Log "ERROR: copy $($_.FullName) -> $dst : $_"
  }
}

Log "Copy complete, removing temp $((Split-Path $NewDir -Parent))"
try { Remove-Item (Split-Path $NewDir -Parent) -Recurse -Force -ErrorAction Stop } catch {
  Log "WARN: remove temp failed: $_"
}

Log "Starting $Exe"
try {
  Start-Process $Exe
  Log "Start-Process succeeded"
} catch {
  Log "ERROR: Start-Process $Exe failed: $_"
}
Log "Updater exiting"`
      writeFileSync(scriptPath, script, 'utf-8')
      const scriptSize = statSync(scriptPath).size
      const logDir = dirname(UPDATE_LOG)
      const logDirOk = existsSync(logDir)
      logger.info('[Updater] script written path=%s size=%d logDir=%s exists=%s', scriptPath, scriptSize, logDir, logDirOk)
      const spawnArgs = [
        '/c', 'start', '', '/min',
        'powershell',
        '-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass',
        '-File', scriptPath,
        '-OldDir', appDir,
        '-NewDir', extractDir,
        '-Exe', exePath,
        '-LogFile', UPDATE_LOG,
        '-Pid', String(process.pid)
      ]
      logger.info('[Updater] spawn args: cmd %s', spawnArgs.map((a, i) => `${i}:${a}`).join(' '))
      logger.info('[Updater] launching updater via cmd /c start, appDir=%s log=%s', appDir, UPDATE_LOG)

      // Use cmd /c start to launch PowerShell — 'start' creates a truly independent process.
      // Direct spawn('powershell', ..., { detached: true }) prevents -File scripts from executing
      // on Windows in GUI (Electron) contexts. This is a known Node.js bug:
      // https://github.com/nodejs/node/issues/51018
      // https://stackoverflow.com/questions/63453647
      const cp: ChildProcess = spawn('cmd', spawnArgs, { detached: true, stdio: 'ignore' })

      if (cp.pid) {
        logger.info('[Updater] child spawned pid=%d', cp.pid)
      } else {
        logger.error('[Updater] child spawned but pid is undefined!')
      }

      cp.on('error', (err) => {
        logger.error('[Updater] spawn error:', err)
      })

      cp.unref()

      // 给 OS 时间创建子进程，避免 app.quit() 在 spawn 完成前杀掉事件循环
      setTimeout(() => {
        logger.info('[Updater] calling app.quit()')
        app.quit()
      }, 2000)
    } catch (e) {
      this.updating = false
      throw e
    }
  }
}

export const autoUpdater = new AutoUpdaterManager()
