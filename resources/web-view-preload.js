const { ipcRenderer } = require('electron')

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
  }
}
