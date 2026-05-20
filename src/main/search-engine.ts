import { pluginHost } from '@main/plugin-host'
import { prefixRegistry } from '@main/prefix-registry'
import { formDialog } from '@main/form-dialog'
import { webViewManager } from '@main/web-view-manager'
import { logger, createPluginLogger } from '@main/logger'
import { companionManager } from '@main/companion-manager'
import { readFileSync, existsSync } from 'fs'
import { resolve as pathResolve, extname, isAbsolute } from 'path'
import { fileURLToPath } from 'url'
import { clipboard, shell } from 'electron'
import type { SearchResult, SearchResponse, ICommand, CommandContext, CommandOutcome, PluginContext } from '@shared/plugin-api'

export interface ExecuteResult {
  outcome?: 'close' | 'home'
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
  if (/^file:\/\//.test(icon)) {
    try {
      const filePath = fileURLToPath(icon)
      const ext = extname(filePath).toLowerCase()
      if (ext && MIME_MAP[ext] && existsSync(filePath)) {
        const buf = readFileSync(filePath)
        return `data:${MIME_MAP[ext]};base64,${buf.toString('base64')}`
      }
    } catch { /* fall through */ }
  }

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
  return results.slice(0, MAX_RESULTS).map((r, i) => ({
    ...r,
    shortcutIndex: i,
    icon: resolveIcon(r.icon)
  }))
}

function collectFallbackResults(cmds: ICommand[], pluginId: string): SearchResult[] {
  return cmds.map(cmd => ({
    id: cmd.id,
    pluginId,
    name: cmd.name,
    icon: cmd.icon,
    preview: cmd.preview,
    shortcutIndex: 0,
    contextMenu: cmd.contextMenu
  }))
}

class SearchEngine {
  async search(input: string): Promise<SearchResponse> {
    const text = input.trim()
    if (!text) return { mode: 'main', results: await this.getHomeCommands('') }

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

    return { mode: 'main', results: await this.getHomeCommands(text) }
  }

  private async getHomeCommands(input: string): Promise<SearchResult[]> {
    const results: SearchResult[] = []

    for (const plugin of pluginHost.getAll()) {
      if (plugin.prefix) {
        if (input) {
          const matchText = `${plugin.prefix} ${plugin.name}`.toLowerCase()
          if (!matchText.includes(input.toLowerCase())) continue
        }
        results.push({
          id: `home-${plugin.id}`,
          pluginId: plugin.id,
          name: plugin.name,
          icon: plugin.icon,
          preview: `输入 ${plugin.prefix} 进入${plugin.name}`,
          shortcutIndex: 0,
          prefixEntry: plugin.prefix
        })
      }
    }

    for (const { pluginId, cmd } of await pluginHost.getFallbackCommands(input)) {
      results.push({
        id: cmd.id,
        pluginId,
        name: cmd.name,
        icon: cmd.icon,
        preview: cmd.preview,
        shortcutIndex: 0
      })
    }

    return normalizeResults(results)
  }

  async searchSubcommand(pluginId: string, subInput: string): Promise<SearchResult[]> {
    const plugin = pluginHost.get(pluginId)
    if (!plugin) return []

    const pluginCtx = this.makePluginContext(pluginId)
    const commands = await plugin.buildCommands(pluginCtx, subInput)
    const results = collectFallbackResults(commands, pluginId)

    if (plugin.getFallbackCommands) {
      const fbs = await plugin.getFallbackCommands(pluginCtx, subInput)
      results.push(...collectFallbackResults(fbs, pluginId))
    }

    return normalizeResults(results)
  }

  async execute(pluginId: string, commandId: string, input: string, showToast: (msg: string) => void): Promise<ExecuteResult> {
    const plugin = pluginHost.get(pluginId)
    if (!plugin) {
      logger.warn('[SE] execute: plugin not found id=%s', pluginId)
      return { outcome: 'close' }
    }

    logger.trace('[SE] execute plugin=%s cmd=%s input=%s', pluginId, commandId, input)

    const ctx: CommandContext = {
      input,
      toast: showToast,
      showForm: async (config) => formDialog.show(config),
      openWebView: async (config) => {
        logger.trace('[SE] openWebView called')
        const result = await webViewManager.open(config)
        logger.trace('[SE] openWebView resolved result=%o', result)
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
        openExternal: async (url) => shell.openExternal(url),
        openPath: async (path) => shell.openPath(path),
        showItemInFolder: (path) => shell.showItemInFolder(path),
        beep: () => shell.beep()
      },
      companions: companionManager.getHandlesForPlugin(pluginId),
      log: createPluginLogger(pluginId)
    }

    if (plugin.icon) {
      const original = ctx.openWebView
      ctx.openWebView = async (config) => {
        config.pluginIcon = resolveIcon(plugin.icon)
        return original(config)
      }
    }
    const cmd = await this.resolveCommand(plugin, commandId, input, pluginId)
    let outcome: CommandOutcome | void = undefined
    if (cmd) {
      logger.trace('[SE] executing cmd=%s', commandId)
      outcome = await cmd.execute(ctx)
      logger.trace('[SE] cmd.execute returned outcome=%s', outcome)
    }

    logger.trace('[SE] execute done outcome=%s', outcome)
    return { outcome: outcome || undefined }
  }

  private async resolveCommand(plugin: { buildCommands(ctx: PluginContext, input: string): Promise<ICommand[]>; getFallbackCommands?(ctx: PluginContext, input: string): Promise<ICommand[]> }, commandId: string, input: string, pluginId: string): Promise<ICommand | null> {
    const pluginCtx = this.makePluginContext(pluginId)
    const commands = await plugin.buildCommands(pluginCtx, input)
    const direct = commands.find((c: ICommand) => c.id === commandId)
    if (direct) return direct

    if (plugin.getFallbackCommands) {
      const fbs = await plugin.getFallbackCommands(pluginCtx, input)
      const fb = fbs.find((c: ICommand) => c.id === commandId)
      if (fb) return fb
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
