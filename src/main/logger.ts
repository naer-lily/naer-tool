import { homedir } from 'os'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import log from 'electron-log'

const LOG_DIR = join(homedir(), '.futari', 'logs')
if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true })
}

log.transports.file.resolvePathFn = () => join(LOG_DIR, 'main.log')
log.transports.file.level = 'silly'
log.transports.console.level = 'silly'

export const logger = {
  error: (...args: unknown[]): void => { log.error(...args) },
  warn: (...args: unknown[]): void => { log.warn(...args) },
  info: (...args: unknown[]): void => { log.info(...args) },
  debug: (...args: unknown[]): void => { log.debug(...args) },
  trace: (...args: unknown[]): void => { log.debug(...args) }
}

logger.info(`Log file: ${log.transports.file.getFile().path}`)

