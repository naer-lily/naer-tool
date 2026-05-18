import { pluginHost } from '@main/plugin-host'
import { prefixRegistry } from '@main/prefix-registry'
import { formDialog } from '@main/form-dialog'
import { webViewManager } from '@main/web-view-manager'
import { logger, createPluginLogger } from '@main/logger'
import { companionManager } from '@main/companion-manager'
import { readFileSync, existsSync } from 'fs'
import { resolve as pathResolve, extname, isAbsolute } from 'path'
import { clipboard, shell } from 'electron'
import type { SearchResult, SearchResponse, ICommand, IFallbackCommand, CommandContext, CommandOutcome, PluginContext } from '@shared/plugin-api'

export interface ExecuteResult {
  webViewOpened: boolean
  shouldClose: boolean
}

const MAX_RESULTS = 9

const MIME_MAP: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.webp': 'image/webp'
}

function resolveIcon(icon: string | undefined): string | undefined {
  if (!icon) return icon
  if (/^(<|data:|https?:)/.test(icon)) return icon

  const ext = extname(icon).toLowerCase()
  if (ext && MIME_MAP[ext]) {
    try {
      const absPath = isAbsolute(icon) ? icon : pathResolve(icon)
      if (existsSync(absPath)) {
        const buf = readFileSync(absPath)
        return `data:${MIME_MAP[ext]};base64,${buf.toString('base64')}`
      }
    } catch { /* file not readable, return as-is */ }
  }

  return icon
}

function normalizeResults(results: SearchResult[]): SearchResult[] {
  results.sort((a, b) => b.priority - a.priority)
  return results.slice(0, MAX_RESULTS).map((r, i) => ({
    ...r,
    shortcutIndex: i,
    icon: resolveIcon(r.icon)
  }))
}

function collectFallbackResults(cmds: { id: string; name: string; icon?: string; description: string; matches(input: string): boolean; build(input: string): ICommand }[], pluginId: string, input: string): SearchResult[] {
  const results: SearchResult[] = []
  for (const cmd of cmds) {
    if (cmd.matches(input)) {
      const built = cmd.build(input)
      const m = built.match(input)
      results.push({
        id: built.id,
        pluginId,
        name: built.name,
        icon: built.icon || cmd.icon,
        preview: m?.preview ?? cmd.description,
        priority: m?.priority ?? 0,
        shortcutIndex: 0
      })
    }
  }
  return results
}

class SearchEngine {
  async search(input: string): Promise<SearchResponse> {
    const text = input.trim()
    if (!text) return { mode: 'main', results: await this.getHomeCommands() }

    const prefixMatch = prefixRegistry.match(text)
    if (prefixMatch) {
      const plugin = pluginHost.get(prefixMatch.pluginId)
      return {
        mode: 'subcommand',
        pluginId: prefixMatch.pluginId,
        pluginIcon: resolveIcon(plugin?.icon),
        results: await this.searchSubcommand(prefixMatch.pluginId, prefixMatch.subInput)
      }
    }

    const homeResults = await this.getHomeCommands(text)
    const fbResults = await this.searchFallback(text)
    return { mode: 'main', results: normalizeResults([...homeResults, ...fbResults]) }
  }

  private async getHomeCommands(filter?: string): Promise<SearchResult[]> {
    const results: SearchResult[] = []

    for (const plugin of pluginHost.getAll()) {
      if (plugin.prefix) {
        if (filter) {
          const matchText = `${plugin.prefix} ${plugin.name}`.toLowerCase()
          if (!matchText.includes(filter.toLowerCase())) continue
        }
        results.push({
          id: `home-${plugin.id}`,
          pluginId: plugin.id,
          name: plugin.name,
          icon: plugin.icon,
          preview: `输入 ${plugin.prefix} 进入${plugin.name}`,
          priority: 100,
          shortcutIndex: 0,
          prefixEntry: plugin.prefix
        })
      }
    }

    if (!filter) {
      for (const { pluginId, cmd } of await pluginHost.getFallbackCommands()) {
        results.push({
          id: cmd.id,
          pluginId,
          name: cmd.name,
          icon: cmd.icon,
          preview: cmd.description,
          priority: 10,
          shortcutIndex: 0
        })
      }
    }

    return normalizeResults(results)
  }

  async searchSubcommand(pluginId: string, subInput: string): Promise<SearchResult[]> {
    const plugin = pluginHost.get(pluginId)
    if (!plugin) return []

    const pluginCtx = this.makePluginContext(pluginId)
    const commands = await plugin.buildCommands(pluginCtx)
    const results: SearchResult[] = []

    for (const cmd of commands) {
      const match = cmd.match(subInput)
      if (match) {
        results.push({
          id: cmd.id,
          pluginId,
          name: cmd.name,
          icon: cmd.icon,
          preview: match.preview,
          priority: match.priority ?? 0,
          shortcutIndex: 0
        })
      }
    }

    if (plugin.getFallbackCommands) {
      const fbs = await plugin.getFallbackCommands(pluginCtx)
      results.push(...collectFallbackResults(fbs, pluginId, subInput))
    }

    return normalizeResults(results)
  }

  private async searchFallback(input: string): Promise<SearchResult[]> {
    const entries = await pluginHost.getFallbackCommands()
    const results: SearchResult[] = []

    for (const { pluginId, cmd } of entries) {
      if (cmd.matches(input)) {
        results.push(...collectFallbackResults([cmd], pluginId, input))
      }
    }

    return normalizeResults(results)
  }

  async execute(pluginId: string, commandId: string, input: string, showToast: (msg: string) => void): Promise<ExecuteResult> {
    const plugin = pluginHost.get(pluginId)
    if (!plugin) {
      logger.warn('[SE] execute: plugin not found id=%s', pluginId)
      return { webViewOpened: false, shouldClose: true }
    }

    logger.trace('[SE] execute plugin=%s cmd=%s input=%s', pluginId, commandId, input)

    let webViewResult: unknown = undefined
    let hadWebView = false

    const ctx: CommandContext = {
      input,
      toast: showToast,
      showForm: (config) => formDialog.show(config),
      openWebView: async (config) => {
        hadWebView = true
        const result = await webViewManager.open(config)
        webViewResult = result
        return result
      },
      closeWebView: () => webViewManager.close(),
      clipboard: {
        writeText: (text) => clipboard.writeText(text),
        readText: () => clipboard.readText(),
        writeHTML: (html) => clipboard.writeHTML(html),
        readHTML: () => clipboard.readHTML(),
        clear: () => clipboard.clear()
      },
      shell: {
        openExternal: (url) => shell.openExternal(url),
        openPath: (path) => shell.openPath(path),
        showItemInFolder: (path) => shell.showItemInFolder(path),
        beep: () => shell.beep()
      },
      companions: companionManager.getHandlesForPlugin(pluginId),
      log: createPluginLogger(pluginId)
    }

    if (plugin.icon) {
      const original = ctx.openWebView
      ctx.openWebView = (config) => {
        config.pluginIcon = resolveIcon(plugin.icon)
        return original(config)
      }
    }
    const cmd = await this.resolveCommand(plugin, commandId, input, pluginId)
    let outcome: CommandOutcome | void = undefined
    if (cmd) {
      outcome = await cmd.execute(ctx)
    }

    let shouldClose: boolean
    if (outcome === 'close') {
      shouldClose = true
    } else if (outcome === 'home') {
      shouldClose = false
    } else if (hadWebView) {
      shouldClose = webViewResult !== undefined
    } else {
      shouldClose = true
    }
    logger.trace('[SE] execute done hadWebView=%s wvResult=%o outcome=%s shouldClose=%s', hadWebView, webViewResult, outcome, shouldClose)
    return { webViewOpened: false, shouldClose }
  }

  private async resolveCommand(plugin: { buildCommands(ctx: PluginContext): Promise<ICommand[]>; getFallbackCommands?(ctx: PluginContext): Promise<IFallbackCommand[]> }, commandId: string, input: string, pluginId: string): Promise<ICommand | null> {
    const pluginCtx = this.makePluginContext(pluginId)
    const commands = await plugin.buildCommands(pluginCtx)
    const direct = commands.find((c: ICommand) => c.id === commandId)
    if (direct) return direct

    if (plugin.getFallbackCommands) {
      const fbs = await plugin.getFallbackCommands(pluginCtx)
      const fb = fbs.find((f: IFallbackCommand) => f.id === commandId)
      if (fb) return fb.build(input)
    }

    return null
  }

  private makePluginContext(pluginId: string): PluginContext {
    return {
      companions: companionManager.getHandlesForPlugin(pluginId),
      log: createPluginLogger(pluginId)
    }
  }
}

export const searchEngine = new SearchEngine()
