const PREFIX = '[FUTARI]'

function ts(): string {
  return new Date().toISOString().slice(11, 23)
}

export const logger = {
  error: (...args: unknown[]): void => { console.error(PREFIX, ts(), ...args) },
  warn: (...args: unknown[]): void => { console.warn(PREFIX, ts(), ...args) },
  info: (...args: unknown[]): void => { console.log(PREFIX, ts(), ...args) },
  debug: (...args: unknown[]): void => { console.log(PREFIX, ts(), ...args) },
  trace: (...args: unknown[]): void => { console.log(PREFIX, ts(), ...args) }
}
