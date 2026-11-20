import { AnimatePresence, m, useReducedMotion } from 'motion/react'

export function DragOverlay({ visible }: { visible: boolean }) {
  const reduce = useReducedMotion()

  return (
    <AnimatePresence>
      {visible && (
        <m.div
          aria-hidden="true"
          initial={reduce ? { opacity: 0 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-bg/80 p-6 backdrop-blur-sm"
        >
          <m.div
            initial={reduce ? false : { scale: 0.97, y: 8 }}
            animate={{ scale: 1, y: 0 }}
            exit={reduce ? undefined : { scale: 0.98, y: 4 }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            className="flex w-full max-w-md flex-col items-center gap-3 rounded-dropzone border-2 border-dashed border-accent bg-accent-soft px-6 py-14 text-center"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-8 w-8 text-accent">
              <path d="M12 16V4m0 0L8 8m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
            </svg>
            <p className="text-sm font-semibold text-text">Thả file để thêm vào danh sách</p>
            <p className="text-xs text-muted">Buông chuột tại đây</p>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  )
}
