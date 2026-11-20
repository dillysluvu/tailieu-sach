import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, m, useReducedMotion } from 'motion/react'
import { DragOverlay } from './components/DragOverlay'
import { PdfMergerPanel } from './components/PdfMergerPanel'
import { PdfToWordPanel } from './components/PdfToWordPanel'
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
      const target: TabKey = tab === 'word' ? 'pdftoword' : tab
      if (target !== tab) {
        setTab(target)
        setNotice('Đã chuyển sang tab PDF → Word')
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
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-32 pt-5 sm:px-8 sm:pt-7 md:max-w-3xl md:pb-12">
      <header className="sticky top-0 z-20 -mx-4 flex items-center justify-between border-b border-line/70 bg-bg/80 px-4 py-3 backdrop-blur-xl sm:-mx-8 sm:px-8">
        <span aria-hidden="true" className="relative inline-block h-4 w-4 rounded-[5px] bg-text">
          <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-accent" />
        </span>
        <ThemeToggle preference={preference} onCycle={cycle} />
      </header>

      <h1 className="sr-only">Cắt &amp; gộp PDF, Word sang PDF</h1>

      <div className="mt-6 sm:mt-7">
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
            className="fixed left-1/2 top-20 z-40 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-card border border-line bg-surface px-3.5 py-2.5 text-center text-xs text-text shadow-[var(--shadow)]"
          >
            {notice}
          </m.div>
        )}
      </AnimatePresence>

      <div className="mt-6 flex-1">
        <div id="panel-pdf" role="tabpanel" aria-labelledby="tab-pdf" className={tab === 'pdf' ? '' : 'hidden'}>
          <PdfMergerPanel incoming={incoming} onFiles={handleFiles} active={tab === 'pdf'} exportRef={exportRef} />
        </div>
        <div id="panel-word" role="tabpanel" aria-labelledby="tab-word" className={tab === 'word' ? '' : 'hidden'}>
          <WordPanel incoming={incoming} onFiles={handleFiles} active={tab === 'word'} exportRef={exportRef} />
        </div>
        <div
          id="panel-pdftoword"
          role="tabpanel"
          aria-labelledby="tab-pdftoword"
          className={tab === 'pdftoword' ? '' : 'hidden'}
        >
          <PdfToWordPanel
            incoming={incoming}
            onFiles={handleFiles}
            active={tab === 'pdftoword'}
            exportRef={exportRef}
          />
        </div>
      </div>

      <DragOverlay visible={dragging} />
    </main>
  )
}
