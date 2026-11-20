import { useEffect, type ReactNode } from 'react'
import { m, useReducedMotion } from 'motion/react'

type Props = {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}

export function Modal({ open, title, onClose, children, footer, wide = false }: Props) {
  const reduce = useReducedMotion()

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6" role="presentation">
      <button
        type="button"
        aria-label="Đóng"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/50 backdrop-blur-sm"
      />
      <m.div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
        className={`relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-card border border-line bg-surface shadow-[var(--shadow)] sm:rounded-card ${
          wide ? 'max-w-4xl' : 'max-w-2xl'
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <h2 className="truncate text-[13px] font-semibold tracking-[-0.01em] text-text">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Đóng" className="btn-ghost -mr-2 h-11 w-11 justify-center">
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3 sm:px-5">{footer}</div>
        )}
      </m.div>
    </div>
  )
}
