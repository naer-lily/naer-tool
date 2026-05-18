import { readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { IPlugin, IFallbackCommand, ICommand } from '@shared/plugin-api'
import { logger } from '@main/logger'

const PLUGINS_DIR = join(homedir(), '.futari', 'plugins')

class PluginHost {
  private plugins = new Map<string, IPlugin>()
  private pluginPaths = new Map<string, string>()

  get(pluginId: string): IPlugin | undefined {
    return this.plugins.get(pluginId)
  }

  getAll(): IPlugin[] {
    return Array.from(this.plugins.values())
  }

  async loadFromPath(pluginPath: string): Promise<IPlugin> {
    const resolved = require.resolve(pluginPath)
    delete require.cache[resolved]

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(pluginPath)
    const plugin: IPlugin = mod.default || mod

    if (!plugin.id || !plugin.name) {
      delete require.cache[resolved]
      throw new Error(`Plugin at "${pluginPath}" missing id or name`)
    }

    if (this.plugins.has(plugin.id)) {
      await this.unload(plugin.id)
    }

    await plugin.onActivate({})
    this.plugins.set(plugin.id, plugin)
    this.pluginPaths.set(plugin.id, pluginPath)
    logger.info('[PluginHost] loaded: %s (%s)', plugin.id, pluginPath)
    return plugin
  }

  async unload(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId)
    if (!plugin) return

    await plugin.onDeactivate()
    this.plugins.delete(pluginId)

    const p = this.pluginPaths.get(pluginId)
    if (p && !p.startsWith('builtin:')) {
      try {
        delete require.cache[require.resolve(p)]
      } catch { /* already cleared */ }
    }
    this.pluginPaths.delete(pluginId)
  }

  /** 扫描 ~/.futari/plugins/ 目录，加载所有用户插件（先卸载旧的全部再重新加载） */
  async scanAndLoadUserPlugins(): Promise<IPlugin[]> {
    const results: IPlugin[] = []

    // unload existing user plugins
    for (const [id, p] of this.pluginPaths) {
      if (!p.startsWith('builtin:')) {
        try {
          await this.unload(id)
        } catch (e) {
          logger.error('[PluginHost] unload failed for %s:', id, e)
        }
      }
    }

    if (!existsSync(PLUGINS_DIR)) return results

    const entries = readdirSync(PLUGINS_DIR, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const dir = join(PLUGINS_DIR, entry.name)
      if (!existsSync(join(dir, 'package.json'))) continue

      try {
        // Node require(dir) resolves via package.json main field
        const plugin = await this.loadFromPath(dir)
        results.push(plugin)
      } catch (e) {
        logger.error('[PluginHost] failed to load %s:', dir, e)
      }
    }

    logger.info('[PluginHost] scan complete: %d user plugins loaded', results.length)
    return results
  }

  registerBuiltin(plugin: IPlugin, id: string): void {
    this.plugins.set(id, plugin)
    this.pluginPaths.set(id, `builtin:${id}`)
  }

  async getFallbackCommands(): Promise<{ pluginId: string; cmd: IFallbackCommand }[]> {
    const result: { pluginId: string; cmd: IFallbackCommand }[] = []
    for (const [pluginId, plugin] of this.plugins) {
      if (plugin.getFallbackCommands) {
        const cmds = await plugin.getFallbackCommands({})
        for (const cmd of cmds) {
          result.push({ pluginId, cmd })
        }
      }
    }
    return result
  }
}

export const pluginHost = new PluginHost()
