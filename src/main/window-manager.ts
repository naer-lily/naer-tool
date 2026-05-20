import type { BrowserWindow } from 'electron'
import { searchWindow } from '@main/search-window'
import type { AppSignalAutoActivate, AppSignalPayload } from '@shared/ipc-channels'

export function createWindow(): void {
  searchWindow.create()
}

export function showWindow(): void {
  searchWindow.show()
}

export function hideWindow(): void {
  searchWindow.hide()
}

export function getMainWindow(): BrowserWindow | null {
  return searchWindow.browserWindow
}

export function getWebContents() {
  return searchWindow.webContents
}

export function getScale(): number {
  return searchWindow.scale
}

export function getScaledWinWidth(): number {
  return searchWindow.scaledWinWidth
}

export function getScaledSearchHeight(): number {
  return searchWindow.scaledSearchHeight
}

export function getScaledContainerWidth(): number {
  return searchWindow.scaledContainerWidth
}

export function getScaledContainerX(): number {
  return searchWindow.scaledContainerX
}

export function setWindowHeight(rendererHeight: number): void {
  searchWindow.setWindowHeight(rendererHeight)
}

export function resetWindowHeight(): void {
  searchWindow.resetWindowHeight()
}

export function setWindowSize(w: number, h: number): void {
  searchWindow.setWindowSize(w, h)
}

export function applyScale(newScale: number): void {
  searchWindow.applyScale(newScale)
}

export function sendSignal(type: AppSignalPayload['type'], extra?: Partial<AppSignalPayload>): void {
  searchWindow.sendSignal(type, extra)
}

export function signalShow(autoActivate?: AppSignalAutoActivate): void {
  searchWindow.signalShow(autoActivate)
}

export function checkAutoActivate(): AppSignalAutoActivate | null {
  return searchWindow.checkAutoActivate()
}
