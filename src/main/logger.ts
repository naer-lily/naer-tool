import { homedir } from 'os'
import { join } from 'path'
import { existsSync, mkdirSync, appendFileSync } from 'fs'
import log from 'electron-log'
import type { PluginLogger } from '@shared/plugin-api'

const LOG_DIR = join(homedir(), '.futari', 'logs')
if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true })
}

const DATE_FORMAT = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'

log.transports.file.resolvePathFn = () => join(LOG_DIR, 'main.log')
log.transports.file.level = 'silly'
log.transports.file.format = DATE_FORMAT
log.transports.console.level = 'silly'
log.transports.console.format = DATE_FORMAT

export const logger: PluginLogger = {
  error: (...args: unknown[]): void => { log.error(...args) },
  warn: (...args: unknown[]): void => { log.warn(...args) },
  info: (...args: unknown[]): void => { log.info(...args) },
  debug: (...args: unknown[]): void => { log.debug(...args) },
  trace: (...args: unknown[]): void => { log.debug(...args) }
}

function formatLogLine(level: string, args: unknown[]): string {
  const now = new Date()
  const pad = (n: number, len = 2): string => String(n).padStart(len, '0')
  const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`
  const text = args.map((a) => {
    if (typeof a === 'string') return a
    if (a instanceof Error) return a.stack || a.message
    try { return JSON.stringify(a) } catch { return String(a) }
  }).join(' ')
  return `[${ts}] [${level}] ${text}\n`
}

export function createPluginLogger(pluginId: string): PluginLogger {
  const logPath = join(LOG_DIR, `${pluginId}.log`)
  return {
    error: (...args) => appendFileSync(logPath, formatLogLine('error', args)),
    warn: (...args) => appendFileSync(logPath, formatLogLine('warn', args)),
    info: (...args) => appendFileSync(logPath, formatLogLine('info', args)),
    debug: (...args) => appendFileSync(logPath, formatLogLine('debug', args)),
    trace: (...args) => appendFileSync(logPath, formatLogLine('debug', args))
  }
}

logger.info(`Log file: ${log.transports.file.getFile().path}`)
