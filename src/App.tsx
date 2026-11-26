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

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-32 pt-5 sm:px-8 sm:pt-7 md:max-w-3xl md:pb-12">
      <header className="sticky top-0 z-20 -mx-4 flex items-center justify-between border-b border-line/70 bg-bg/80 px-4 py-3 backdrop-blur-xl sm:-mx-8 sm:px-8">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="relative inline-block h-4 w-4 rounded-[5px] bg-text">
            <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-accent" />
          </span>
          <span className="text-[13px] font-semibold tracking-[-0.01em] text-text">Tài liệu PDF</span>
        </div>
        <ThemeToggle preference={preference} onCycle={cycle} />
      </header>

      <h1 className="sr-only">Cắt gộp PDF, tách file, xuất ảnh, chuyển PDF và Word</h1>

      <div className="mt-5 sm:mt-6">
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

      <DragOverlay visible={dragging} />
    </main>
  )
}
