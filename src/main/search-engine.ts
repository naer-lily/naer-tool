import { pluginHost } from './plugin-host'
import { prefixRegistry } from './prefix-registry'
import type { SearchResult, SearchResponse, ICommand } from '../shared/plugin-api'

class SearchEngine {
  async search(input: string): Promise<SearchResponse> {
    const text = input.trim()
    if (!text) return { mode: 'main', results: [] }

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

    return { mode: 'main', results: await this.searchFallback(text) }
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

  async execute(pluginId: string, commandId: string, input: string): Promise<unknown> {
    const plugin = pluginHost.get(pluginId)
    if (!plugin) return null

    const commands = await plugin.buildCommands({})
    const command = commands.find((c: ICommand) => c.id === commandId)
    if (!command) return null

    return command.execute({ input })
  }
}

export const searchEngine = new SearchEngine()
