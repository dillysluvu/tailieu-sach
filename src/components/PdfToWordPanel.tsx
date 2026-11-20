import { useCallback, useEffect, useRef, useState } from 'react'
import { useAsyncTask } from '../hooks/useAsyncTask'
import type { ExportRef } from '../hooks/useExportShortcut'
import { downloadBytes } from '../lib/download'
import { isPdfFile, LIMITS, sizeError } from '../lib/errors'
import { getPdfPageCount } from '../lib/pdf'
import { convertPdfToWord } from '../lib/pdfToWord'
import { rangeIssue } from '../lib/parse'
import type { IncomingFiles } from '../types'
import { Dropzone } from './Dropzone'
import { RangeInputs } from './RangeInputs'
import { StickyActionBar } from './StickyActionBar'
import { StatusLine } from './StatusLine'

type Props = {
  incoming: IncomingFiles
  onFiles: (files: File[]) => void
  active: boolean
  exportRef: ExportRef
}

export function PdfToWordPanel({ incoming, onFiles, active, exportRef }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [bytes, setBytes] = useState<Uint8Array | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [from, setFrom] = useState(1)
  const [to, setTo] = useState(1)
  const lastToken = useRef(0)
  const { status, message, run, reset } = useAsyncTask()

  const acceptFiles = useCallback(async (files: File[]) => {
    const pdfs = files.filter(isPdfFile)
    if (!pdfs.length) throw new Error('Chỉ hỗ trợ file .pdf.')
    if (pdfs.length > 1) throw new Error('Chọn một file .pdf mỗi lần.')
    if (pdfs[0].size > LIMITS.maxFileBytes) throw new Error(sizeError(pdfs[0]))
    const data = new Uint8Array(await pdfs[0].arrayBuffer())
    const count = await getPdfPageCount(data)
    setFile(pdfs[0])
    setBytes(data)
    setPageCount(count)
    setFrom(1)
    setTo(count)
  }, [])

  useEffect(() => {
    if (incoming.token > lastToken.current && incoming.files.length) {
      lastToken.current = incoming.token
      void run(() => acceptFiles(incoming.files), 'Sẵn sàng. Chọn khoảng trang nếu cần.')
    }
  }, [incoming, acceptFiles, run])

  const issue = bytes ? rangeIssue(from, to, pageCount) : null
  const busy = status === 'running'

  const handleDownload = useCallback(() => {
    if (!file || !bytes) return
    void run(async () => {
      const output = await convertPdfToWord(bytes, from, to)
      downloadBytes(output, `${file.name.replace(/\.pdf$/i, '')}.docx`)
    }, 'Đã tải file Word.')
  }, [bytes, file, from, run, to])

  useEffect(() => {
    if (!active) return
    exportRef.current = handleDownload
    return () => {
      if (exportRef.current === handleDownload) exportRef.current = null
    }
  }, [active, exportRef, handleDownload])

  const clear = () => {
    reset()
    setFile(null)
    setBytes(null)
    setPageCount(0)
    setFrom(1)
    setTo(1)
  }

  return (
    <section>
      <h2 className="sr-only">PDF sang Word</h2>

      <Dropzone
        accept=".pdf,application/pdf"
        multiple={false}
        title="Kéo file PDF vào đây"
        hint="hoặc bấm để chọn · trích văn bản sang Word"
        onFiles={onFiles}
        busy={busy}
      />

      {bytes && file && (
        <>
          <div className="mt-6 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <span className="mt-0.5 shrink-0 rounded bg-accent-soft px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.08em] text-accent">
                PDF
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium tracking-[-0.01em] text-text" title={file.name}>
                  {file.name}
                </p>
                <p className="mt-0.5 text-[11px] tabular text-muted">{pageCount} trang · sẵn sàng</p>
              </div>
            </div>
            <button type="button" onClick={clear} className="btn-ghost -mr-2">
              Chọn file khác
            </button>
          </div>

          <div className="mt-5 flex flex-wrap items-end justify-between gap-4 md:gap-6">
            <div>
              <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.1em] text-faint">
                Khoảng trang cần chuyển
              </p>
              <RangeInputs
                from={from}
                to={to}
                max={pageCount}
                onChange={(nextFrom, nextTo) => {
                  setFrom(nextFrom)
                  setTo(nextTo)
                }}
              />
              {issue && <p className="mt-2 text-[11px] text-danger">{issue}</p>}
            </div>
          </div>

          <p className="mt-6 text-[11px] leading-relaxed text-faint">
            Chữ trong PDF trở thành văn bản sửa được trong Word. Layout, bảng và ảnh không giữ nguyên; PDF scan
            (chỉ có ảnh) cần OCR.
          </p>

          <StickyActionBar
            busy={busy}
            disabled={!!issue}
            label="Tải Word"
            onAction={handleDownload}
            summary={
              <>
                Chuyển <span className="font-semibold text-text">{Math.max(0, to - from + 1)}</span> / {pageCount}{' '}
                trang
              </>
            }
          />
        </>
      )}

      <StatusLine message={message} status={status} />
    </section>
  )
}
