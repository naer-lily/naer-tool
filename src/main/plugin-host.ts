import { readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { IPlugin, ICommand, PluginContext, CompanionConfig, CompanionHandle } from '@shared/plugin-api'
import { logger, createPluginLogger } from '@main/logger'
import { companionManager } from '@main/companion-manager'

function buildPluginContext(pluginId: string): PluginContext {
  return {
    companions: companionManager.getHandlesForPlugin(pluginId),
    log: createPluginLogger(pluginId)
  }
}

async function startCompanions(pluginId: string, configs: CompanionConfig[]): Promise<CompanionHandle[]> {
  try {
    return await companionManager.startForPlugin(pluginId, configs)
  } catch (e) {
    logger.error('[PluginHost] companion start failed for %s:', pluginId, e)
    return []
  }
}

const PLUGINS_DIR = join(homedir(), '.futari', 'plugins')

class PluginHost {
  private readonly plugins = new Map<string, IPlugin>()
  private readonly pluginPaths = new Map<string, string>()

  get(pluginId: string): IPlugin | undefined {
    return this.plugins.get(pluginId)
  }

  getAll(): IPlugin[] {
    return Array.from(this.plugins.values())
  }

  async loadFromPath(pluginPath: string): Promise<IPlugin> {
    const resolved = require.resolve(pluginPath)
    delete require.cache[resolved]

     
    const mod = require(pluginPath)
    const plugin: IPlugin = mod.default || mod

    if (!plugin.id || !plugin.name) {
      delete require.cache[resolved]
      throw new Error(`Plugin at "${pluginPath}" missing id or name`)
    }

    if (this.plugins.has(plugin.id)) {
      await this.unload(plugin.id)
    }

    const ctx = buildPluginContext(plugin.id)
    await plugin.onActivate(ctx)

    if (plugin.companion) {
      const configs = Array.isArray(plugin.companion) ? plugin.companion : [plugin.companion]
      const handles = await startCompanions(plugin.id, configs)
      ctx.companions = handles
    }

    this.plugins.set(plugin.id, plugin)
    this.pluginPaths.set(plugin.id, pluginPath)
    logger.info('[PluginHost] loaded: %s (%s)', plugin.id, pluginPath)
    return plugin
  }

  async unload(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId)
    if (!plugin) return

    companionManager.stopForPlugin(pluginId)
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

  async activateBuiltin(plugin: IPlugin, id: string): Promise<void> {
    if (!this.plugins.has(id)) {
      this.registerBuiltin(plugin, id)
    }
    const ctx = buildPluginContext(id)
    await plugin.onActivate(ctx)
    if (plugin.companion) {
      const configs = Array.isArray(plugin.companion) ? plugin.companion : [plugin.companion]
      const handles = await startCompanions(id, configs)
      ctx.companions = handles
    }
  }

  async getFallbackCommands(input: string): Promise<{ pluginId: string; cmd: ICommand }[]> {
    const result: { pluginId: string; cmd: ICommand }[] = []
    for (const [pluginId, plugin] of this.plugins) {
      if (plugin.getFallbackCommands) {
        const ctx = buildPluginContext(pluginId)
        const cmds = await plugin.getFallbackCommands(ctx, input)
        for (const cmd of cmds) {
          result.push({ pluginId, cmd })
        }
      }
    }
    return result
  }
}

export const pluginHost = new PluginHost()
