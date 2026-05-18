import { spawn, type ChildProcess } from 'child_process'
import { createInterface } from 'readline'
import { createServer } from 'net'
import { logger } from '@main/logger'
import type { CompanionConfig, CompanionHandle } from '@shared/plugin-api'

interface ManagedCompanion {
  pluginId: string
  process: ChildProcess
  config: CompanionConfig
  handle: CompanionHandle
}

function findFreePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      server.close(() => resolve(port))
    })
    server.on('error', () => resolve(0))
  })
}

async function waitForHealth(url: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(url)
      if (resp.ok) return true
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  return false
}

class CompanionManager {
  private companions = new Map<string, ManagedCompanion>()
  private messageBuffers = new Map<string, Array<(data: unknown) => void>>()

  async startForPlugin(pluginId: string, configs: CompanionConfig[]): Promise<CompanionHandle[]> {
    const handles: CompanionHandle[] = []
    for (let i = 0; i < configs.length; i++) {
      const key = `${pluginId}:${i}`
      const existing = this.companions.get(key)
      if (existing && !existing.process.killed) {
        existing.handle.kill()
      }

      const config = { ...configs[i] }
      const handle = await this.spawn(key, pluginId, config)
      this.companions.set(key, { pluginId, process: (handle as unknown as { _process: ChildProcess })._process, config, handle })
      handles.push(handle)
      logger.info('[Companion] %s[%d]: started pid=%d cmd=%s', pluginId, i, handle.pid, config.command)
    }
    return handles
  }

  private async spawn(key: string, pluginId: string, config: CompanionConfig): Promise<CompanionHandle> {
    const isHttp = config.mode === 'http'
    let port = 0
    let url = ''

    if (isHttp && config.http) {
      port = await findFreePort()
      if (!port) {
        throw new Error(`[Companion] ${key}: failed to find free port`)
      }
      url = `http://127.0.0.1:${port}`
    }

    const env = { ...process.env, ...config.env }
    if (isHttp && port) {
      env.FUTARI_PORT = String(port)
      env.PORT = String(port)
    }

    const cp = spawn(config.command, config.args || [], {
      cwd: config.cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    const listeners: Array<(data: unknown) => void> = []
    this.messageBuffers.set(key, listeners)

    if (!isHttp) {
      const rl = createInterface({ input: cp.stdout!, crlfDelay: Infinity })
      rl.on('line', (line) => {
        try {
          const data = JSON.parse(line.trim())
          const cbs = this.messageBuffers.get(key)
          if (cbs) {
            for (const cb of cbs) cb(data)
          }
        } catch {
          // ignore non-JSON stdout lines
        }
      })
    }

    cp.stderr?.on('data', (data) => {
      const text = String(data).trim()
      if (text) {
        logger.debug('[Companion] %s stderr: %s', key, text)
      }
    })

    cp.on('exit', (code) => {
      logger.info('[Companion] %s: exited with code %s', key, code)
      this.companions.delete(key)
      this.messageBuffers.delete(key)
    })

    if (isHttp && url && config.http) {
      const healthPath = config.http.healthPath || '/health'
      const timeout = config.http.timeout || 10000
      logger.info('[Companion] %s: waiting for health check %s%s', key, url, healthPath)
      const ok = await waitForHealth(url + healthPath, timeout)
      if (!ok) {
        cp.kill('SIGTERM')
        throw new Error(`[Companion] ${key}: health check timeout for ${url}${healthPath}`)
      }
    }

    const internalCtx = { cp, key, config, url }

    const handle: CompanionHandle = {
      pid: cp.pid!,
      config,
      url: url || undefined,
      send(data: unknown): void {
        if (cp.stdin && !cp.stdin.destroyed) {
          cp.stdin.write(JSON.stringify(data) + '\n')
        }
      },
      onMessage(cb: (data: unknown) => void): () => void {
        listeners.push(cb)
        return () => {
          const idx = listeners.indexOf(cb)
          if (idx >= 0) listeners.splice(idx, 1)
        }
      },
      kill(): void {
        if (!cp.killed) {
          cp.kill('SIGTERM')
          setTimeout(() => {
            if (!cp.killed) cp.kill('SIGKILL')
          }, 5000)
        }
      }
    }

    ;(handle as unknown as { _internal: typeof internalCtx })._internal = internalCtx
    return handle
  }

  stopForPlugin(pluginId: string): void {
    for (const [key, mc] of this.companions) {
      if (mc.pluginId === pluginId) {
        mc.handle.kill()
        this.companions.delete(key)
        this.messageBuffers.delete(key)
      }
    }
    logger.info('[Companion] %s: all companions stopped', pluginId)
  }

  getHandlesForPlugin(pluginId: string): CompanionHandle[] {
    const handles: CompanionHandle[] = []
    for (const [key, mc] of this.companions) {
      if (mc.pluginId === pluginId) {
        handles.push(mc.handle)
      }
    }
    return handles
  }

  stopAll(): void {
    for (const [key, mc] of this.companions) {
      mc.handle.kill()
    }
    this.companions.clear()
    this.messageBuffers.clear()
    logger.info('[Companion] all companions stopped')
  }
}

export const companionManager = new CompanionManager()
