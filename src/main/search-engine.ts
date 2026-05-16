import { pluginHost } from './plugin-host'
import { prefixRegistry } from './prefix-registry'
import type { SearchResult, SearchResponse, ICommand, IFallbackCommand } from '../shared/plugin-api'

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
        pluginIcon: plugin?.icon,
        results: await this.searchSubcommand(prefixMatch.pluginId, prefixMatch.subInput)
      }
    }

    const homeResults = await this.getHomeCommands(text)
    const fbResults = await this.searchFallback(text)
    const all = [...homeResults, ...fbResults].sort((a, b) => b.priority - a.priority)
    return { mode: 'main', results: all.slice(0, 9).map((r, i) => ({ ...r, shortcutIndex: i })) }
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

    results.sort((a, b) => b.priority - a.priority)
    return results.slice(0, 9).map((r, i) => ({ ...r, shortcutIndex: i }))
  }

  async searchSubcommand(pluginId: string, subInput: string): Promise<SearchResult[]> {
    const plugin = pluginHost.get(pluginId)
    if (!plugin) return []

    const commands = await plugin.buildCommands({})
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
      const fbs = await plugin.getFallbackCommands({})
      for (const fb of fbs) {
        if (fb.matches(subInput)) {
          const built = fb.build(subInput)
          const m = built.match(subInput)
          results.push({
            id: built.id,
            pluginId,
            name: built.name,
            icon: built.icon || fb.icon,
            preview: m?.preview ?? fb.description,
            priority: m?.priority ?? 0,
            shortcutIndex: 0
          })
        }
      }
    }

    results.sort((a, b) => b.priority - a.priority)
    return results.slice(0, 9).map((r, i) => ({ ...r, shortcutIndex: i }))
  }

  private async searchFallback(input: string): Promise<SearchResult[]> {
    const entries = await pluginHost.getFallbackCommands()
    const results: SearchResult[] = []

    for (const { pluginId, cmd } of entries) {
      if (cmd.matches(input)) {
        const command = cmd.build(input)
        const match = command.match(input)
        results.push({
          id: command.id,
          pluginId,
          name: command.name,
          icon: command.icon || cmd.icon,
          preview: match?.preview ?? cmd.description,
          priority: match?.priority ?? 0,
          shortcutIndex: 0
        })
      }
    }

    results.sort((a, b) => b.priority - a.priority)
    return results.slice(0, 9).map((r, i) => ({ ...r, shortcutIndex: i }))
  }

  async execute(pluginId: string, commandId: string, input: string, showToast: (msg: string) => void): Promise<void> {
    const plugin = pluginHost.get(pluginId)
    if (!plugin) return

    const ctx = { input, toast: showToast }

    const commands = await plugin.buildCommands({})
    const command = commands.find((c: ICommand) => c.id === commandId)
    if (command) {
      await command.execute(ctx)
      return
    }

    if (plugin.getFallbackCommands) {
      const fbs = await plugin.getFallbackCommands({})
      const fb = fbs.find((f: IFallbackCommand) => f.id === commandId)
      if (fb) {
        const built = fb.build(input)
        await built.execute(ctx)
        return
      }
    }
  }
}

export const searchEngine = new SearchEngine()
