import type { ReactNode } from 'react'
import { m, useReducedMotion } from 'motion/react'

type Props = {
  summary: ReactNode
  label: string
  onAction: () => void
  disabled?: boolean
  busy?: boolean
  extra?: ReactNode
}

export function StickyActionBar({ summary, label, onAction, disabled = false, busy = false, extra }: Props) {
  const reduce = useReducedMotion()

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:static md:inset-auto md:mt-0 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
      <div className="mx-auto w-full max-w-3xl px-4 py-3 sm:px-8 md:px-0 md:py-0">
        <div className="relative flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:border-t md:border-line md:pt-4">
          {busy && (
            <m.div
              aria-hidden="true"
              initial={reduce ? false : { width: '0%' }}
              animate={{ width: ['0%', '70%', '100%'] }}
              transition={{ duration: 1.4, ease: 'easeInOut', repeat: Infinity }}
              className="absolute inset-x-0 top-0 h-0.5 rounded-full bg-accent"
            />
          )}
          <p className="text-[11px] tabular text-muted">{summary}</p>
          <div className="flex items-center gap-3">
            <button type="button" onClick={onAction} disabled={disabled || busy} className="btn-primary w-full md:w-auto">
              {busy && (
                <svg viewBox="0 0 24 24" fill="none" className="ts-spinner h-4 w-4">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2.5" />
                  <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              )}
              {busy ? 'Đang xử lý…' : label}
            </button>
            <span className="hidden shrink-0 text-[10px] text-faint md:inline">⌘ / Ctrl + Enter</span>
          </div>
          {extra}
        </div>
      </div>
    </div>
  )
}
