// CTool layout fix: force auto-width and trigger reflow after page init
(function () {
  'use strict'

  var patched = false

  function fixLayout() {
    var page = document.getElementById('ctool')
    if (page) {
      var style = page.style
      if (style.width !== 'auto' || style.height !== 'auto') {
        style.width = 'auto'
        style.height = 'auto'
      }
    }
    window.dispatchEvent(new Event('resize'))
  }

  // Patch early (before CTool's own JS runs)
  var observer = new MutationObserver(function () {
    var page = document.getElementById('ctool')
    if (page && !patched) {
      patched = true
      observer.disconnect()
      // Force auto dimensions before CTool's init code checks clientWidth
      page.style.width = 'auto'
      page.style.height = 'auto'
    }
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })

  // Also fix after page fully loads (catches race conditions)
  window.addEventListener('DOMContentLoaded', function () {
    fixLayout()
    setTimeout(fixLayout, 50)
    setTimeout(fixLayout, 200)
  })

  window.addEventListener('load', function () {
    fixLayout()
    setTimeout(fixLayout, 100)
  })
})()
