import { app } from 'electron'
import { get } from 'https'
import { createWriteStream, mkdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { tmpdir } from 'os'
import { execFile, spawn } from 'child_process'
import { logger } from '@main/logger'

const REPO = 'naer-lily/futari'
const API_LATEST = `https://api.github.com/repos/${REPO}/releases/latest`

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

  getStatus(): UpdateInfo {
    if (this.cached) return { available: this.cached.available, currentVersion: this.cached.currentVersion, latestVersion: this.cached.latestVersion }
    return { available: false, currentVersion: app.getVersion() }
  }

  async checkForUpdates(): Promise<UpdateInfo> {
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
    const downloadUrl = this.cached?._downloadUrl
    if (!downloadUrl) {
      throw new Error('没有找到下载地址，请手动下载更新')
    }

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
param([string]$OldDir,[string]$NewDir,[string]$Exe,[int]$Pid)
Start-Sleep 3
try{Wait-Process -Id $Pid -ErrorAction SilentlyContinue}catch{}
Start-Sleep 1
$srcDir=$NewDir
$found=Get-ChildItem -Path $NewDir -Recurse -Filter 'Futari.exe'|Select-Object -First 1
if($found){$srcDir=Split-Path $found.FullName -Parent}
Get-ChildItem -Path "$srcDir\\*" -Recurse|ForEach-Object{
  $rel=$_.FullName.Substring($srcDir.Length+1)
  $dst=Join-Path $OldDir $rel
  $pd=Split-Path $dst -Parent
  if(!(Test-Path $pd)){New-Item -ItemType Directory -Path $pd -Force|Out-Null}
  Copy-Item $_.FullName $dst -Force
}
Remove-Item (Split-Path $NewDir -Parent) -Recurse -Force
Start-Process $Exe`
    writeFileSync(scriptPath, script, 'utf-8')
    logger.info('[Updater] launching updater script, appDir=%s', appDir)

    spawn('powershell', [
      '-NoProfile', '-WindowStyle', 'Hidden',
      '-File', scriptPath,
      '-OldDir', appDir,
      '-NewDir', extractDir,
      '-Exe', exePath,
      '-Pid', String(process.pid)
    ], { detached: true, stdio: 'ignore' }).unref()

    setImmediate(() => app.quit())
  }
}

export const autoUpdater = new AutoUpdaterManager()
