import { BrowserWindow } from 'electron'
import { windowStateMachine } from '@main/window-state-machine'
import type { WindowState } from '@main/window-state-machine'

export type { WindowState }

export function createWindow(): void {
  windowStateMachine.create()
}

export function showWindow(): void {
  windowStateMachine.show()
}

export function hideWindow(source?: string): void {
  windowStateMachine.hide(source)
}

export function toggleWindow(): void {
  windowStateMachine.toggle()
}

export function getMainWindow(): BrowserWindow | null {
  return windowStateMachine.browserWindow
}

export function getWindowState(): WindowState {
  return windowStateMachine.state
}
