const PREFIX = '[FUTARI]'

function ts(): string {
  return new Date().toISOString().slice(11, 23)
}

function log(level: string, ...args: unknown[]): void {
  if (typeof window !== 'undefined' && window.futariAPI?.log) {
    window.futariAPI.log(level, ts(), ...args)
  }
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  fn(PREFIX, ts(), ...args)
}

export const logger = {
  error: (...args: unknown[]): void => log('error', ...args),
  warn: (...args: unknown[]): void => log('warn', ...args),
  info: (...args: unknown[]): void => log('info', ...args),
  debug: (...args: unknown[]): void => log('debug', ...args),
  trace: (...args: unknown[]): void => log('trace', ...args)
}
