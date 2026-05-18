const PREFIX = '[FUTARI]'

function ts(): string {
  return new Date().toISOString().slice(11, 23)
}

function log(level: string, ...args: unknown[]): void {
  const userFmt = String(args[0])
  const userRest = args.slice(1)

  if (typeof window !== 'undefined' && window.futariAPI?.log) {
    window.futariAPI.log(level, `[renderer] ${ts()} ${userFmt}`, ...userRest)
  }
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  fn(`${PREFIX} ${ts()} ${userFmt}`, ...userRest)
}

export const logger = {
  error: (...args: unknown[]): void => log('error', ...args),
  warn: (...args: unknown[]): void => log('warn', ...args),
  info: (...args: unknown[]): void => log('info', ...args),
  debug: (...args: unknown[]): void => log('debug', ...args),
  trace: (...args: unknown[]): void => log('trace', ...args)
}
