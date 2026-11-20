import { useRef, useState } from 'react'
import { PdfMergerPanel } from './components/PdfMergerPanel'
import { Tabs } from './components/Tabs'
import { WordPanel } from './components/WordPanel'
import { isDocxFile, isPdfFile } from './lib/errors'
import type { IncomingFiles, TabKey } from './types'

export default function App() {
  const [tab, setTab] = useState<TabKey>('pdf')
  const [incoming, setIncoming] = useState<IncomingFiles>({ files: [], token: 0 })
  const [notice, setNotice] = useState('')
  const sequence = useRef(0)

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

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-5 pb-10 pt-8 sm:px-8">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="inline-block h-4 w-4 bg-neutral-950" />
          <span className="text-base font-semibold tracking-tight">sạch.</span>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-neutral-500">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-3.5 w-3.5">
            <rect x="5" y="10" width="14" height="10" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
          File không rời trình duyệt
        </p>
      </header>

      <div className="mt-10">
        <Tabs active={tab} onChange={setTab} />
      </div>

      {notice && (
        <p role="status" className="mt-4 text-xs text-neutral-500">
          {notice}
        </p>
      )}

      <div className="mt-6 flex-1">
        <div
          id="panel-pdf"
          role="tabpanel"
          aria-labelledby="tab-pdf"
          className={tab === 'pdf' ? '' : 'hidden'}
        >
          <PdfMergerPanel incoming={incoming} onFiles={handleFiles} />
        </div>
        <div
          id="panel-word"
          role="tabpanel"
          aria-labelledby="tab-word"
          className={tab === 'word' ? '' : 'hidden'}
        >
          <WordPanel incoming={incoming} onFiles={handleFiles} />
        </div>
      </div>

      <footer className="pt-16 text-xs text-neutral-400">Không quảng cáo · Không lưu trữ · Mở là dùng ngay</footer>
    </main>
  )
}
