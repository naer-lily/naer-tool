import log from 'electron-log'

log.transports.file.level = 'debug'
log.transports.console.level = 'debug'

export const logger = {
  error: (...args: unknown[]): void => { log.error(...args) },
  warn: (...args: unknown[]): void => { log.warn(...args) },
  info: (...args: unknown[]): void => { log.info(...args) },
  debug: (...args: unknown[]): void => { log.debug(...args) },
  trace: (...args: unknown[]): void => { log.silly(...args) }
}

logger.info(`Log file: ${log.transports.file.getFile().path}`)
