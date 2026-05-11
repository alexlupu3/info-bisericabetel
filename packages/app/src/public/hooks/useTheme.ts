import { useState, useEffect } from 'react'
import { safeGet, safeSet } from '../utils/storage'

type Theme = 'light' | 'dark'

function resolveTheme(): Theme {
  const stored = safeGet('theme') as Theme | null
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(resolveTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (meta) meta.content = theme === 'dark' ? '#000000' : '#eeeeee'
  }, [theme])

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    safeSet('theme', next)
    setTheme(next)
  }

  return { theme, toggle }
}
