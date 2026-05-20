import { readdirSync, existsSync, readFileSync } from 'fs'
import { join, extname } from 'path'
import { homedir } from 'os'
import { Module } from 'module'
import type { IPlugin, ICommand, PluginContext, CompanionConfig, CompanionHandle } from '@shared/plugin-api'
import { logger, createPluginLogger } from '@main/logger'
import { companionManager } from '@main/companion-manager'

function isBareSpecifier(request: string): boolean {
  if (request.startsWith('.') || request.startsWith('/')) return false
  return !/^[A-Z]:/.test(request)
}

let tsHookInstalled = false

function ensureTsHook(): void {
  if (tsHookInstalled) return
  tsHookInstalled = true

  try {
    const esbuild: { transformSync(code: string, opts: { loader: string; format: string; sourcefile: string }): { code: string } } = require('esbuild')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Mod = Module as any

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const origResolve: (...args: any[]) => any = Mod._resolveFilename
    Mod._resolveFilename = function (request: string, parent: NodeModule, ...args: unknown[]) {
      if (!isBareSpecifier(request) && !extname(request)) {
        for (const ext of ['.js', '.ts', '.json', '.node']) {
          try {
            return origResolve.call(this, request + ext, parent, ...args)
          } catch (e: unknown) {
            if ((e as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') throw e
          }
        }
      }
      return origResolve.call(this, request, parent, ...args)
    }

    Mod._extensions['.ts'] = (mod: NodeModule, filename: string) => {
      const code = readFileSync(filename, 'utf-8')
      const result = esbuild.transformSync(code, {
        loader: 'ts',
        format: 'cjs',
        sourcefile: filename
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mod as any)._compile(result.code, filename)
    }
  } catch (_e) {
    logger.warn('[PluginHost] esbuild unavailable, .ts plugins will not load')
  }
}

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
  private disabledBuiltins = new Set<string>()

  setDisabledBuiltins(ids: string[]): void {
    this.disabledBuiltins = new Set(ids.filter(id => id !== 'settings'))
    logger.info('[PluginHost] disabledBuiltins updated: %o', [...this.disabledBuiltins])
  }

  get(pluginId: string): IPlugin | undefined {
    return this.plugins.get(pluginId)
  }

  getAll(): IPlugin[] {
    return Array.from(this.plugins.values()).filter(p => {
      const path = this.pluginPaths.get(p.id)
      if (path?.startsWith('builtin:')) {
        return !this.disabledBuiltins.has(p.id)
      }
      return true
    })
  }

  getAllRaw(): IPlugin[] {
    return Array.from(this.plugins.values())
  }

  async loadFromPath(pluginPath: string): Promise<IPlugin> {
    ensureTsHook()

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
