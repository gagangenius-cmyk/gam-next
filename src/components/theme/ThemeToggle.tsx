'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

export type ThemeMode = 'light' | 'dark'
const STORAGE_KEY = 'gam-theme'

function readTheme(): ThemeMode {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}

export function applyTheme(mode: ThemeMode) {
  document.documentElement.setAttribute('data-theme', mode)
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // Storage blocked: the choice just will not persist.
  }
}

// Light is the default; the choice is remembered per browser and applied before first paint by the script in layout.tsx.
export default function ThemeToggle({ className = '' }: { className?: string }) {
  const [mode, setMode] = useState<ThemeMode>('light')

  useEffect(() => {
    setMode(readTheme())
  }, [])

  const next: ThemeMode = mode === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      onClick={() => {
        applyTheme(next)
        setMode(next)
      }}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--cmg-border)] bg-[var(--cmg-surface)] text-[var(--cmg-ink)] shadow-sm transition hover:border-[var(--cmg-blue)] hover:text-[var(--cmg-blue)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cmg-blue)]/40 ${className}`}
    >
      {mode === 'dark' ? <Sun className="h-[18px] w-[18px]" aria-hidden="true" /> : <Moon className="h-[18px] w-[18px]" aria-hidden="true" />}
    </button>
  )
}
