import log from 'electron-log'

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

