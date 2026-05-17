import { ref, watchEffect } from 'vue'

const THEME_KEY = 'futari-theme'
type Theme = 'light' | 'dark'

const theme = ref<Theme>((localStorage.getItem(THEME_KEY) as Theme) || 'dark')

export function useTheme() {
  function apply(): void {
    document.documentElement.setAttribute('data-theme', theme.value)
  }

  function toggle(): void {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
  }

  watchEffect(() => {
    apply()
    localStorage.setItem(THEME_KEY, theme.value)
  })

  return { theme, toggle }
}
