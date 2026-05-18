import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { logger } from '@main/logger'

interface FutariConfig {
  shortcut?: string
  theme?: 'light' | 'dark'
  plugins?: string[]
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
        plugins: []
      }
      this.config = defaults
      this.save()
      logger.info('[Config] created default config at %s', CONFIG_PATH)
    } else {
      try {
        this.config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'))
        logger.info('[Config] loaded config %d plugins', (this.config.plugins || []).length)
      } catch (e) {
        logger.error('[Config] failed to parse config:', e)
        this.config = { shortcut: 'Alt+Space', theme: 'dark', plugins: [] }
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

  getPlugins(): string[] {
    return this.config.plugins || []
  }

  addPlugin(pluginPath: string): void {
    if (!this.config.plugins) this.config.plugins = []
    const normalized = pluginPath.replace(/\\/g, '/')
    if (!this.config.plugins.some(p => p.replace(/\\/g, '/') === normalized)) {
      this.config.plugins.push(pluginPath)
      this.save()
      logger.info('[Config] added plugin: %s', pluginPath)
    }
  }

  removePlugin(pluginPath: string): void {
    if (this.config.plugins) {
      const normalized = pluginPath.replace(/\\/g, '/')
      this.config.plugins = this.config.plugins.filter(p => p.replace(/\\/g, '/') !== normalized)
      this.save()
      logger.info('[Config] removed plugin: %s', pluginPath)
    }
  }
}

export const configManager = new ConfigManager()
