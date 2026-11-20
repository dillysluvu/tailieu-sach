import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, m, useReducedMotion } from 'motion/react'
import { DragOverlay } from './components/DragOverlay'
import { PdfMergerPanel } from './components/PdfMergerPanel'
import { Tabs } from './components/Tabs'
import { ThemeToggle } from './components/ThemeToggle'
import { WordPanel } from './components/WordPanel'
import { useExportShortcut, type ExportRef } from './hooks/useExportShortcut'
import { useGlobalDrag } from './hooks/useGlobalDrag'
import { useTheme } from './hooks/useTheme'
import { isDocxFile, isPdfFile } from './lib/errors'
import type { IncomingFiles, TabKey } from './types'

export default function App() {
  const [tab, setTab] = useState<TabKey>('pdf')
  const [incoming, setIncoming] = useState<IncomingFiles>({ files: [], token: 0 })
  const [notice, setNotice] = useState('')
  const sequence = useRef(0)
  const exportRef = useRef<(() => void) | null>(null) as ExportRef
  const { preference, cycle } = useTheme()
  const reduce = useReducedMotion()

  useExportShortcut(exportRef)

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 3500)
    return () => window.clearTimeout(timer)
  }, [notice])

  const handleFiles = (files: File[]) => {
    if (!files.length) return
    const pdfs = files.filter(isPdfFile)
    const docs = files.filter(isDocxFile)

    if (docs.length && !pdfs.length) {
      if (tab !== 'word') {
        setTab('word')
        setNotice('Đã chuyển sang tab Word → PDF')
      } else {
        setNotice('')
      }
      setIncoming({ files: docs, token: ++sequence.current })
      return
    }

    if (pdfs.length && !docs.length) {
      if (tab !== 'pdf') {
        setTab('pdf')
        setNotice('Đã chuyển sang tab Cắt & Gộp PDF')
      } else {
        setNotice('')
      }
      setIncoming({ files: pdfs, token: ++sequence.current })
      return
    }

    if (pdfs.length && docs.length) {
      setTab('pdf')
      setNotice('Đã bỏ qua file .docx — hãy kéo riêng vào tab Word')
      setIncoming({ files: pdfs, token: ++sequence.current })
      return
    }

    setNotice('Chỉ hỗ trợ file .pdf và .docx')
  }

  const dragging = useGlobalDrag(handleFiles)

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-32 pt-6 sm:px-8 sm:pt-8 md:max-w-3xl md:pb-12">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="inline-block h-3.5 w-3.5 rounded-[2px] bg-text" />
          <span className="text-[15px] font-semibold tracking-[-0.03em] text-text">sạch.</span>
        </div>
        <div className="flex items-center gap-2">
          <p className="hidden items-center gap-1.5 text-[11px] text-muted sm:flex">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-3.5 w-3.5">
              <rect x="5" y="10" width="14" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            File không rời trình duyệt
          </p>
          <ThemeToggle preference={preference} onCycle={cycle} />
        </div>
      </header>

      <div className="mt-7 sm:mt-9">
        <Tabs active={tab} onChange={setTab} />
      </div>

      <AnimatePresence>
        {notice && (
          <m.div
            role="status"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="fixed left-1/2 top-4 z-40 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-card border border-line bg-surface px-3.5 py-2.5 text-center text-xs text-text shadow-[0_8px_30px_rgba(0,0,0,0.10)]"
          >
            {notice}
          </m.div>
        )}
      </AnimatePresence>

      <div className="mt-6 flex-1">
        <div
          id="panel-pdf"
          role="tabpanel"
          aria-labelledby="tab-pdf"
          className={tab === 'pdf' ? '' : 'hidden'}
        >
          <PdfMergerPanel
            incoming={incoming}
            onFiles={handleFiles}
            active={tab === 'pdf'}
            exportRef={exportRef}
          />
        </div>
        <div
          id="panel-word"
          role="tabpanel"
          aria-labelledby="tab-word"
          className={tab === 'word' ? '' : 'hidden'}
        >
          <WordPanel
            incoming={incoming}
            onFiles={handleFiles}
            active={tab === 'word'}
            exportRef={exportRef}
          />
        </div>
      </div>

      <footer className="pt-10 text-[11px] text-faint">Không quảng cáo · Không lưu trữ · Mở là dùng ngay</footer>

      <DragOverlay visible={dragging} />
    </main>
  )
}
