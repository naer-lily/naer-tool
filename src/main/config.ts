import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { app } from 'electron'
import { logger } from '@main/logger'

export interface FutariConfig {
  shortcut?: string
  theme?: 'light' | 'dark'
  launchAtStartup?: boolean
  windowTopRatio?: number
  windowWidth?: number
  scale?: number
  disabledPlugins?: string[]
  lastUpdateCheck?: number
  skipVersion?: string
}

const CONFIG_DIR = join(homedir(), '.futari')
const CONFIG_PATH = join(CONFIG_DIR, 'config.json')

class ConfigManager {
  private config: FutariConfig = {}

  load(): FutariConfig {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true })
    }
    if (!existsSync(CONFIG_PATH)) {
      const defaults: FutariConfig = {
        shortcut: 'Alt+Space',
        theme: 'dark',
        launchAtStartup: false,
        windowTopRatio: 0.12,
        windowWidth: 800,
        scale: 1.0
      }
      this.config = defaults
      this.save()
      logger.info('[Config] created default config at %s', CONFIG_PATH)
    } else {
      try {
        this.config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'))
        logger.info('[Config] loaded config')
      } catch (e) {
        logger.error('[Config] failed to parse config:', e)
        this.config = { shortcut: 'Alt+Space', theme: 'dark', launchAtStartup: false }
      }
    }
    return this.config
  }

  save(): void {
    try {
      writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2), 'utf-8')
    } catch (e) {
      logger.error('[Config] failed to save config:', e)
    }
  }

  getRaw(): FutariConfig {
    return { ...this.config }
  }

  patch(partial: Partial<FutariConfig>): void {
    Object.assign(this.config, partial)
    if ('launchAtStartup' in partial) {
      app.setLoginItemSettings({ openAtLogin: partial.launchAtStartup })
    }
    this.save()
    logger.info('[Config] patched with:', partial)
  }

  getShortcut(): string {
    return this.config.shortcut || 'Alt+Space'
  }

  getTheme(): 'light' | 'dark' {
    return this.config.theme || 'dark'
  }

  getLaunchAtStartup(): boolean {
    return this.config.launchAtStartup || false
  }

  getWindowTopRatio(): number {
    return this.config.windowTopRatio ?? 0.12
  }

  getScale(): number {
    const s = this.config.scale ?? 1.0
    return Math.max(0.5, Math.min(2.0, s))
  }

  getWindowWidth(): number {
    const w = this.config.windowWidth ?? 800
    return Math.max(500, Math.min(1200, w))
  }
}

export const configManager = new ConfigManager()
