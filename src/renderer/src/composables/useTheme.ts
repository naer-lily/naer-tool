import { ref, watchEffect } from 'vue'

const THEME_KEY = 'futari-theme'
type Theme = 'light' | 'dark'

const theme = ref<Theme>('dark')

export function useTheme() {
  function apply(): void {
    document.documentElement.setAttribute('data-theme', theme.value)
  }

  function toggle(): void {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
  }

  function setTheme(t: Theme): void {
    theme.value = t
  }

  function init(): void {
    theme.value = (localStorage.getItem(THEME_KEY) as Theme) || 'dark'
  }

  watchEffect(() => {
    apply()
    localStorage.setItem(THEME_KEY, theme.value)
  })

  return { theme, toggle, setTheme, init }
}
