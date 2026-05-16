import type { IPlugin, IFallbackCommand, ICommand } from '@shared/plugin-api'

class PluginHost {
  private plugins = new Map<string, IPlugin>()
  private pluginPaths = new Map<string, string>()

  get(pluginId: string): IPlugin | undefined {
    return this.plugins.get(pluginId)
  }

  getAll(): IPlugin[] {
    return Array.from(this.plugins.values())
  }

  async load(pluginId: string, pluginPath: string): Promise<IPlugin> {
    if (this.plugins.has(pluginId)) {
      throw new Error(`Plugin "${pluginId}" already loaded`)
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(pluginPath)
    const plugin: IPlugin = mod.default || mod

    if (!plugin.id || !plugin.name) {
      throw new Error(`Plugin at "${pluginPath}" missing id or name`)
    }

    await plugin.onActivate({})

    this.plugins.set(plugin.id, plugin)
    this.pluginPaths.set(plugin.id, pluginPath)
    return plugin
  }

  async unload(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId)
    if (!plugin) return

    await plugin.onDeactivate()

    this.plugins.delete(pluginId)

    const p = this.pluginPaths.get(pluginId)
    if (p && !p.startsWith('builtin:')) {
      delete require.cache[require.resolve(p)]
    }
    this.pluginPaths.delete(pluginId)
  }

  async reload(pluginId: string): Promise<IPlugin> {
    const p = this.pluginPaths.get(pluginId)
    if (!p) throw new Error(`Plugin "${pluginId}" not found`)
    await this.unload(pluginId)
    return this.load(pluginId, p)
  }

  async reloadAll(): Promise<IPlugin[]> {
    const ids = Array.from(this.plugins.keys())
    const results: IPlugin[] = []
    for (const id of ids) {
      const p = this.pluginPaths.get(id)
      if (!p || p.startsWith('builtin:')) continue
      await this.unload(id)
      results.push(await this.load(id, p))
    }
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
