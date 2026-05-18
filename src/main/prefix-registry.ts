import { pluginHost } from '@main/plugin-host'

class PrefixRegistry {
  private readonly map = new Map<string, string>()

  /** The space after prefix is part of the trigger: user types "prefix " */
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
      if (lower.startsWith(prefix + ' ')) {
        return { pluginId, subInput: input.slice(prefix.length + 1) }
      }
    }
    return null
  }

  getPrefixes(): string[] {
    return Array.from(this.map.keys())
  }
}

export const prefixRegistry = new PrefixRegistry()
