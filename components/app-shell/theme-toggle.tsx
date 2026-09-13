'use client'

import { useEffect } from 'react'

type Theme = 'light' | 'dark'

function preferredTheme(): Theme {
  const saved = window.localStorage.getItem('northstar-theme')
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeToggle() {
  useEffect(() => {
    const selected = preferredTheme()
    document.documentElement.dataset.theme = selected
  }, [])

  function toggle() {
    const current = document.documentElement.dataset.theme ?? preferredTheme()
    const selected = current === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = selected
    window.localStorage.setItem('northstar-theme', selected)
  }

  return (
    <button className="icon-button" type="button" onClick={toggle} aria-label="Toggle color theme">
      <span aria-hidden="true">◐</span>
    </button>
  )
}
