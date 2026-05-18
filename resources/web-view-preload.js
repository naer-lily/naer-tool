const { ipcRenderer, clipboard, shell } = require('electron')

window.futariWeb = {
  onSubInputChange(cb) {
    ipcRenderer.on('sub-input-change', (_event, data) => {
      if (typeof cb === 'function') cb(data.text)
    })
  },

  send(data) {
    ipcRenderer.send('web-view-message', data)
  },

  setHeight(height) {
    ipcRenderer.send('web-view-resize', height)
  },

  async getTheme() {
    return ipcRenderer.invoke('get-theme')
  },

  close(data) {
    ipcRenderer.send('close-web-view', data)
  },

  clipboard: {
    writeText(text) {
      clipboard.writeText(text)
    },
    readText() {
      return clipboard.readText()
    },
    writeHTML(html) {
      clipboard.writeHTML(html)
    },
    readHTML() {
      return clipboard.readHTML()
    },
    writeImage(image) {
      clipboard.writeImage(image)
    },
    readImage() {
      return clipboard.readImage()
    },
    clear() {
      clipboard.clear()
    }
  },

  shell: {
    openExternal(url) {
      shell.openExternal(url)
    },
    openPath(path) {
      return shell.openPath(path)
    },
    showItemInFolder(path) {
      shell.showItemInFolder(path)
    },
    beep() {
      shell.beep()
    }
  }
}
