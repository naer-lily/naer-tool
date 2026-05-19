import { pluginHost } from '@main/plugin-host'

class PrefixRegistry {
  private readonly map = new Map<string, string>()

  /** Exact prefix match triggers subcommand entry */
  rebuild(): void {
    this.map.clear()
    for (const plugin of pluginHost.getAll()) {
      if (plugin.prefix) {
        this.map.set(plugin.prefix.toLowerCase(), plugin.id)
      }
    }
  }

  match(input: string): { pluginId: string; subInput: string } | null {
    const lower = input.toLowerCase()
    for (const [prefix, pluginId] of this.map) {
      if (lower === prefix) {
        return { pluginId, subInput: '' }
      }
    }
    return null
  }

  getPrefixes(): string[] {
    return Array.from(this.map.keys())
  }
}

export const prefixRegistry = new PrefixRegistry()
