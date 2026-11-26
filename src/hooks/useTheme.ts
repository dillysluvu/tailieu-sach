import { useCallback, useEffect, useState } from 'react'
import type { ResolvedTheme, ThemePreference } from '../types'

const STORAGE_KEY = 'ts-theme'

function readPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'system' || saved === 'light' || saved === 'dark') return saved
  } catch {
    /* bỏ qua khi storage bị chặn */
  }
  return 'system'
}

function prefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(readPreference)
  const [systemDark, setSystemDark] = useState(prefersDark)

  const resolved: ResolvedTheme = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark')
    document.documentElement.style.colorScheme = resolved
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', resolved === 'dark' ? '#161618' : '#f5f5f7')
    try {
      localStorage.setItem(STORAGE_KEY, preference)
    } catch {
      /* bỏ qua khi storage bị chặn */
    }
  }, [preference, resolved])

  const cycle = useCallback(() => {
    setPreference((current) => (current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system'))
  }, [])

  return { preference, resolved, cycle }
}
