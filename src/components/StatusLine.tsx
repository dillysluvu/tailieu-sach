import type { TaskStatus } from '../types'

type Props = {
  message: string
  status: TaskStatus
}

const COLORS: Record<TaskStatus, string> = {
  idle: 'text-neutral-500',
  running: 'text-neutral-500',
  done: 'text-neutral-700',
  error: 'text-red-700',
}

export function StatusLine({ message, status }: Props) {
  if (!message) return null
  return (
    <p role="status" aria-live="polite" className={`mt-3 text-xs ${COLORS[status]}`}>
      {message}
    </p>
  )
}
