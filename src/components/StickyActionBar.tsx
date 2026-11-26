import type { ReactNode } from 'react'
import { m, useReducedMotion } from 'motion/react'

type Props = {
  summary: ReactNode
  label: string
  onAction: () => void
  disabled?: boolean
  busy?: boolean
  extra?: ReactNode
  secondary?: { label: string; onClick: () => void }
}

export function StickyActionBar({ summary, label, onAction, disabled = false, busy = false, extra, secondary }: Props) {
  const reduce = useReducedMotion()

  return (
    <div className="soft-shadow fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-2xl backdrop-saturate-150 md:sticky md:inset-x-auto md:bottom-0 md:z-20 md:-mx-7 md:-mb-6 md:mt-6 md:bg-surface/92 md:pb-0 md:shadow-none">
      <div className="mx-auto w-full max-w-3xl px-4 py-3 sm:px-6 md:max-w-none md:px-7 md:py-3.5">
        <div className="relative flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          {busy && (
            <m.div
              aria-hidden="true"
              initial={reduce ? false : { width: '0%' }}
              animate={{ width: ['0%', '70%', '100%'] }}
              transition={{ duration: 1.4, ease: 'easeInOut', repeat: Infinity }}
              className="absolute inset-x-0 top-0 h-0.5 rounded-full bg-accent"
            />
          )}
          <p className="text-[12px] tabular text-muted">{summary}</p>
          <div className="flex items-center gap-2.5">
            {secondary && (
              <button type="button" onClick={secondary.onClick} disabled={busy} className="btn-ghost shrink-0">
                {secondary.label}
              </button>
            )}
            <button
              type="button"
              onClick={onAction}
              disabled={disabled || busy}
              className={`btn-primary ${secondary ? 'flex-1 md:flex-none' : 'w-full md:w-auto'}`}
            >
              {busy && (
                <svg viewBox="0 0 24 24" fill="none" className="ts-spinner h-4 w-4">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2.5" />
                  <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              )}
              {busy ? 'Đang xử lý…' : label}
            </button>
            <kbd className="kbd-cap hidden shrink-0 md:inline-flex" title="Phím tắt xuất nhanh">
              ⌘ ↵
            </kbd>
          </div>
          {extra}
        </div>
      </div>
    </div>
  )
}
