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
        className="absolute inset-0 cursor-default bg-black/35 backdrop-blur-md"
      />
      <m.div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
        className={`relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[20px] border border-line bg-surface shadow-[0_24px_64px_rgba(0,0,0,0.28)] sm:rounded-[18px] ${
          wide ? 'max-w-4xl' : 'max-w-2xl'
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line bg-surface/85 px-4 py-3 backdrop-blur-xl sm:px-5">
          <h2 className="truncate text-[14px] font-semibold tracking-[-0.015em] text-text">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="touch-target -mr-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-surface-hover text-base font-medium text-muted transition-colors hover:text-text"
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-line bg-bg/50 px-4 py-3 sm:px-5">
            {footer}
          </div>
        )}
      </m.div>
    </div>
  )
}
