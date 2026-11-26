import { useEffect, useState } from 'react'
import { AnimatePresence, m, useReducedMotion } from 'motion/react'
import type { TaskStatus } from '../types'

type Props = {
  message: string
  status: TaskStatus
}

function StatusIcon({ status }: { status: TaskStatus }) {
  if (status === 'running') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className="ts-spinner h-4 w-4 text-accent">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    )
  }
  if (status === 'done') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4 text-success">
        <path d="m5 12 4.5 4.5L19 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (status === 'error') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-danger">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5m0 3h.01" strokeLinecap="round" />
      </svg>
    )
  }
  return null
}

export function StatusLine({ message, status }: Props) {
  const [dismissed, setDismissed] = useState('')
  const reduce = useReducedMotion()
  const key = `${status}:${message}`
  const visible = Boolean(message) && dismissed !== key

  useEffect(() => {
    if (status !== 'done' || !message) return
    const timer = window.setTimeout(() => setDismissed(key), 3000)
    return () => window.clearTimeout(timer)
  }, [key, message, status])

  return (
    <AnimatePresence>
      {message && visible && (
        <m.div
          key={key}
          role={status === 'error' ? 'alert' : 'status'}
          aria-live={status === 'error' ? 'assertive' : 'polite'}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.98 }}
          transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
          className="fixed inset-x-4 bottom-24 z-40 flex items-center gap-2.5 rounded-[14px] border border-line bg-surface/92 px-4 py-3 text-xs font-medium text-text shadow-[0_14px_38px_rgba(0,0,0,0.14)] backdrop-blur-2xl md:inset-x-auto md:bottom-6 md:right-6 md:min-w-64"
        >
          <StatusIcon status={status} />
          <span>{message}</span>
        </m.div>
      )}
    </AnimatePresence>
  )
}
