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
          className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-bg/70 p-6 backdrop-blur-xl"
        >
          <m.div
            initial={reduce ? false : { scale: 0.96, y: 8 }}
            animate={{ scale: 1, y: 0 }}
            exit={reduce ? undefined : { scale: 0.98, y: 4 }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            className="flex w-full max-w-md flex-col items-center gap-3 rounded-[22px] border-2 border-dashed border-accent bg-surface/92 px-6 py-14 text-center shadow-[0_24px_60px_rgba(0,113,227,0.18)] backdrop-blur-2xl"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-accent text-white shadow-[0_6px_16px_-4px_rgba(0,113,227,0.45)]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-6 w-6">
                <path d="M12 16V4m0 0L8 8m4-4 4 4M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="text-[15px] font-semibold tracking-[-0.015em] text-text">Thả file để thêm vào danh sách</p>
            <p className="text-xs text-muted">Buông chuột tại đây</p>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  )
}
