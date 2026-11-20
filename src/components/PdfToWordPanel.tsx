import { useCallback, useEffect, useRef, useState } from 'react'
import { useAsyncTask } from '../hooks/useAsyncTask'
import type { ExportRef } from '../hooks/useExportShortcut'
import { downloadBytes } from '../lib/download'
import { isPdfFile, LIMITS, sizeError } from '../lib/errors'
import { getPdfPageCount } from '../lib/pdf'
import {
  buildDocx,
  extractPdfText,
  parseEditedText,
  toEditableText,
  type ExtractResult,
} from '../lib/pdfToWord'
import { rangeIssue } from '../lib/parse'
import type { IncomingFiles } from '../types'
import { Dropzone } from './Dropzone'
import { Modal } from './Modal'
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
  const [keepBreaks, setKeepBreaks] = useState(true)
  const [extract, setExtract] = useState<ExtractResult | null>(null)
  const [extractedFrom, setExtractedFrom] = useState(0)
  const [extractedTo, setExtractedTo] = useState(0)
  const [editedText, setEditedText] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const lastToken = useRef(0)
  const { status, message, run } = useAsyncTask()

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
    setExtract(null)
    setEditedText('')
  }, [])

  useEffect(() => {
    if (incoming.token > lastToken.current && incoming.files.length) {
      lastToken.current = incoming.token
      void run(() => acceptFiles(incoming.files), 'Sẵn sàng. Chọn khoảng trang nếu cần.')
    }
  }, [incoming, acceptFiles, run])

  const issue = bytes ? rangeIssue(from, to, pageCount) : null
  const busy = status === 'running'
  const cached = extract && extractedFrom === from && extractedTo === to

  const ensureExtract = useCallback(async (): Promise<ExtractResult> => {
    if (!bytes) throw new Error('Hãy kéo file PDF trước.')
    if (cached && extract) return extract
    const result = await extractPdfText(bytes, from, to)
    setExtract(result)
    setExtractedFrom(from)
    setExtractedTo(to)
    setEditedText(toEditableText(result, keepBreaks))
    return result
  }, [bytes, cached, extract, from, keepBreaks, to])

  const handlePreview = useCallback(() => {
    void run(async () => {
      const result = await ensureExtract()
      setEditedText(toEditableText(result, keepBreaks))
      setPreviewOpen(true)
    }, 'Đã trích xong văn bản — bạn có thể xem và sửa trước khi tải.')
  }, [ensureExtract, keepBreaks, run])

  const handleDownload = useCallback(() => {
    if (!file) return
    void run(async () => {
      const result = await ensureExtract()
      const output = await buildDocx(result.pages, keepBreaks)
      downloadBytes(output, `${file.name.replace(/\.pdf$/i, '')}.docx`)
    }, 'Đã tải file Word.')
  }, [ensureExtract, file, keepBreaks, run])

  const handleDownloadEdited = useCallback(() => {
    if (!file) return
    void run(async () => {
      const output = await buildDocx(parseEditedText(editedText), keepBreaks)
      downloadBytes(output, `${file.name.replace(/\.pdf$/i, '')}.docx`)
    }, 'Đã tải file Word từ bản bạn sửa.')
  }, [editedText, file, keepBreaks, run])

  useEffect(() => {
    if (!active) return
    exportRef.current = handleDownload
    return () => {
      if (exportRef.current === handleDownload) exportRef.current = null
    }
  }, [active, exportRef, handleDownload])

  const clear = () => {
    setFile(null)
    setBytes(null)
    setPageCount(0)
    setFrom(1)
    setTo(1)
    setExtract(null)
    setEditedText('')
    setPreviewOpen(false)
  }

  const toggleBreaks = (value: boolean) => {
    setKeepBreaks(value)
    if (extract) setEditedText(toEditableText(extract, value))
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

          {extract && (
            <p className="mt-4 text-[11px] tabular text-muted">
              {extract.stats.pages} trang · {extract.stats.paragraphs} đoạn · {extract.stats.chars} ký tự
            </p>
          )}

          <p className="mt-4 text-[11px] leading-relaxed text-faint">
            Ghép dòng bị ngắt, nhận diện tiêu đề/ danh sách, lọc header/footer lặp và tách cột cơ bản. Chữ giữ sửa
            được; layout phức tạp và ảnh không giữ nguyên. PDF scan cần OCR.
          </p>

          <StickyActionBar
            busy={busy}
            disabled={!!issue}
            label="Tải Word"
            onAction={handleDownload}
            secondary={{ label: 'Xem trước', onClick: handlePreview }}
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

      <Modal
        open={previewOpen}
        title="Xem trước & chỉnh sửa văn bản"
        onClose={() => setPreviewOpen(false)}
        wide
        footer={
          <>
            <button type="button" onClick={() => setPreviewOpen(false)} className="btn-ghost">
              Đóng
            </button>
            <button type="button" onClick={handleDownloadEdited} className="btn-primary" disabled={busy}>
              Tải bản đã sửa
            </button>
          </>
        }
      >
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[12px] text-muted">
          <input
            type="checkbox"
            checked={keepBreaks}
            onChange={(event) => toggleBreaks(event.target.checked)}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          Giữ nguyên ranh giới trang
        </label>
        <p className="mb-2 mt-3 text-[11px] leading-relaxed text-faint">
          Gõ <span className="font-medium text-muted"># </span> đầu dòng để thành tiêu đề,{' '}
          <span className="font-medium text-muted">- </span> để thành danh sách,{' '}
          <span className="font-medium text-muted">**chữ**</span> để in đậm,{' '}
          <span className="font-medium text-muted">*chữ*</span> để nghiêng.
        </p>
        <textarea
          aria-label="Nội dung văn bản"
          value={editedText}
          onChange={(event) => setEditedText(event.target.value)}
          spellCheck={false}
          className="h-[45dvh] w-full resize-y rounded-card border border-line bg-bg p-3 text-[13px] leading-relaxed text-text outline-none transition-colors duration-150 focus:border-accent"
        />
      </Modal>
    </section>
  )
}
