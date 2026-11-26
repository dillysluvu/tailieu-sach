import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, m, useReducedMotion } from 'motion/react'
import { CompressPdfPanel } from './components/CompressPdfPanel'
import { DragOverlay } from './components/DragOverlay'
import { EditPdfPanel } from './components/EditPdfPanel'
import { ImageToPdfPanel } from './components/ImageToPdfPanel'
import { PdfMergerPanel } from './components/PdfMergerPanel'
import { PdfToImagesPanel } from './components/PdfToImagesPanel'
import { PdfToWordPanel } from './components/PdfToWordPanel'
import { SplitPdfPanel } from './components/SplitPdfPanel'
import { Tabs } from './components/Tabs'
import { ThemeToggle } from './components/ThemeToggle'
import { WordPanel } from './components/WordPanel'
import { useExportShortcut, type ExportRef } from './hooks/useExportShortcut'
import { useGlobalDrag } from './hooks/useGlobalDrag'
import { useTheme } from './hooks/useTheme'
import { isDocxFile, isImageFile, isPdfFile } from './lib/errors'
import { TAB_INFO } from './lib/tabs'
import type { IncomingFiles, TabKey } from './types'

const PDF_TABS: ReadonlySet<TabKey> = new Set(['pdf', 'split', 'compress', 'edit', 'pdf2img', 'pdf2word'])

export default function App() {
  const [tab, setTab] = useState<TabKey>('pdf')
  const [incoming, setIncoming] = useState<IncomingFiles>({ files: [], token: 0, target: 'pdf' })
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
    const images = files.filter(isImageFile)

    if (images.length && (pdfs.length || docs.length)) {
      const target: TabKey = tab === 'pdf2word' ? 'pdf2word' : 'image'
      setTab(target)
      setNotice('Đã bỏ qua file khác loại — kéo riêng từng loại nhé')
      setIncoming({ files: images, token: ++sequence.current, target })
      return
    }

    if (images.length) {
      if (tab === 'pdf2word') {
        setNotice('')
        setIncoming({ files: images, token: ++sequence.current, target: 'pdf2word' })
        return
      }
      if (tab !== 'image') {
        setTab('image')
        setNotice('Đã chuyển sang Ảnh → PDF')
      } else {
        setNotice('')
      }
      setIncoming({ files: images, token: ++sequence.current, target: 'image' })
      return
    }

    if (docs.length && !pdfs.length) {
      if (tab !== 'word') {
        setTab('word')
        setNotice('Đã chuyển sang Word → PDF')
      } else {
        setNotice('')
      }
      setIncoming({ files: docs, token: ++sequence.current, target: 'word' })
      return
    }

    if (pdfs.length && !docs.length) {
      const target: TabKey = PDF_TABS.has(tab) ? tab : 'pdf'
      if (target !== tab) {
        setTab(target)
        setNotice('Đã chuyển sang Cắt & Gộp PDF')
      } else {
        setNotice('')
      }
      setIncoming({ files: pdfs, token: ++sequence.current, target })
      return
    }

    if (pdfs.length && docs.length) {
      const target: TabKey = PDF_TABS.has(tab) ? tab : 'pdf'
      setTab(target)
      setNotice('Đã bỏ qua file .docx — hãy kéo riêng vào mục Word → PDF')
      setIncoming({ files: pdfs, token: ++sequence.current, target })
      return
    }

    setNotice('Chỉ hỗ trợ file PDF, Word (.docx) hoặc ảnh (JPG, PNG, WebP)')
  }

  const dragging = useGlobalDrag(handleFiles)
  const currentTab = TAB_INFO[tab]

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[1040px] flex-col md:px-6 md:py-7">
      <div className="mac-window flex flex-1 flex-col overflow-x-clip pb-32 md:overflow-hidden md:pb-0">
        <header className="group/bar sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-surface/85 px-4 py-2.5 backdrop-blur-2xl backdrop-saturate-150 sm:px-6 md:static md:px-5">
          <div className="flex items-center gap-3">
            <div aria-hidden="true" className="hidden items-center gap-2 md:flex">
              <span className="h-3 w-3 rounded-full bg-line-strong transition-colors duration-150 group-hover/bar:bg-[#ff5f57]" />
              <span className="h-3 w-3 rounded-full bg-line-strong transition-colors duration-150 group-hover/bar:bg-[#febc2e]" />
              <span className="h-3 w-3 rounded-full bg-line-strong transition-colors duration-150 group-hover/bar:bg-[#28c840]" />
            </div>
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-accent text-white shadow-[0_1px_4px_rgba(0,113,227,0.35)]"
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
                  <path d="M5 3.5h6.5L15 7v9.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-13Z" strokeLinejoin="round" />
                  <path d="M11.5 3.5V7H15" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="text-[13px] font-semibold tracking-[-0.015em] text-text">Tài liệu PDF</span>
            </div>
          </div>

          <span className="hidden text-[12.5px] font-medium text-muted md:block">{currentTab.label}</span>

          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-line bg-bg/80 px-2.5 py-1 text-[11px] font-medium text-muted sm:inline-flex">
              Xử lý trên máy
            </span>
            <ThemeToggle preference={preference} onCycle={cycle} />
          </div>
        </header>

        <h1 className="sr-only">Cắt gộp PDF, tách file, nén PDF, chỉnh trang, xuất ảnh, chuyển PDF và Word</h1>

        <AnimatePresence>
          {notice && (
            <m.div
              role="status"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
              className="fixed left-1/2 top-16 z-40 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-full border border-line bg-surface/92 px-4 py-2.5 text-center text-xs font-medium text-text shadow-[var(--shadow)] backdrop-blur-2xl"
            >
              {notice}
            </m.div>
          )}
        </AnimatePresence>

        <div className="flex flex-1 flex-col md:grid md:grid-cols-[236px_minmax(0,1fr)]">
          <aside className="mac-sidebar border-b border-line px-4 py-3 sm:px-6 md:border-b-0 md:border-r md:p-3.5">
            <Tabs active={tab} onChange={setTab} />
          </aside>

          <div className="min-w-0 flex-1 px-4 pb-6 pt-5 sm:px-6 md:px-8 md:py-7">
            <div className="mb-5 border-b border-line/80 pb-4">
              <p className="text-[19px] font-semibold tracking-[-0.025em] text-text sm:text-[20px]">
                {currentTab.label}
              </p>
              <p className="mt-0.5 text-[12.5px] text-muted">{currentTab.hint}</p>
            </div>

            <div id="panel-pdf" role="tabpanel" aria-labelledby="tab-pdf" className={tab === 'pdf' ? '' : 'hidden'}>
              <PdfMergerPanel incoming={incoming} onFiles={handleFiles} active={tab === 'pdf'} exportRef={exportRef} />
            </div>
            <div id="panel-split" role="tabpanel" aria-labelledby="tab-split" className={tab === 'split' ? '' : 'hidden'}>
              <SplitPdfPanel incoming={incoming} onFiles={handleFiles} active={tab === 'split'} exportRef={exportRef} />
            </div>
            <div id="panel-compress" role="tabpanel" aria-labelledby="tab-compress" className={tab === 'compress' ? '' : 'hidden'}>
              <CompressPdfPanel incoming={incoming} onFiles={handleFiles} active={tab === 'compress'} exportRef={exportRef} />
            </div>
            <div id="panel-edit" role="tabpanel" aria-labelledby="tab-edit" className={tab === 'edit' ? '' : 'hidden'}>
              <EditPdfPanel incoming={incoming} onFiles={handleFiles} active={tab === 'edit'} exportRef={exportRef} />
            </div>
            <div id="panel-pdf2img" role="tabpanel" aria-labelledby="tab-pdf2img" className={tab === 'pdf2img' ? '' : 'hidden'}>
              <PdfToImagesPanel incoming={incoming} onFiles={handleFiles} active={tab === 'pdf2img'} exportRef={exportRef} />
            </div>
            <div id="panel-pdf2word" role="tabpanel" aria-labelledby="tab-pdf2word" className={tab === 'pdf2word' ? '' : 'hidden'}>
              <PdfToWordPanel incoming={incoming} onFiles={handleFiles} active={tab === 'pdf2word'} exportRef={exportRef} />
            </div>
            <div id="panel-word" role="tabpanel" aria-labelledby="tab-word" className={tab === 'word' ? '' : 'hidden'}>
              <WordPanel incoming={incoming} onFiles={handleFiles} active={tab === 'word'} exportRef={exportRef} />
            </div>
            <div id="panel-image" role="tabpanel" aria-labelledby="tab-image" className={tab === 'image' ? '' : 'hidden'}>
              <ImageToPdfPanel incoming={incoming} onFiles={handleFiles} active={tab === 'image'} exportRef={exportRef} />
            </div>
          </div>
        </div>
      </div>

      <DragOverlay visible={dragging} />
    </main>
  )
}
