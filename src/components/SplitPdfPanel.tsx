import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PDFDocument } from 'pdf-lib'
import { useAsyncTask } from '../hooks/useAsyncTask'
import type { ExportRef } from '../hooks/useExportShortcut'
import { downloadBytes } from '../lib/download'
import { isPdfFile, LIMITS, sizeError } from '../lib/errors'
import { loadPdf } from '../lib/pdf'
import { buildFixedParts, parseCustomParts, splitPdfToArchive, type SplitMode } from '../lib/splitPdf'
import type { IncomingFiles } from '../types'
import { Dropzone } from './Dropzone'
import { PdfPreviewModal } from './PdfPreviewModal'
import { StickyActionBar } from './StickyActionBar'
import { StatusLine } from './StatusLine'

type Props = {
  incoming: IncomingFiles
  onFiles: (files: File[]) => void
  active: boolean
  exportRef: ExportRef
}

const MODES: Array<{ value: SplitMode; label: string; desc: string }> = [
  { value: 'fixed', label: 'Chia đều theo số trang', desc: 'Ví dụ: cứ 4 trang thành 1 đề' },
  { value: 'custom', label: 'Tự chọn từng phần', desc: 'Ví dụ: 1-4, 5-8, 9-12' },
  { value: 'every', label: 'Mỗi trang 1 file', desc: 'Tách rời từng trang riêng biệt' },
]

export function SplitPdfPanel({ incoming, onFiles, active, exportRef }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [mode, setMode] = useState<SplitMode>('fixed')
  const [pagesPerPart, setPagesPerPart] = useState(2)
  const [customInput, setCustomInput] = useState('')
  const [baseName, setBaseName] = useState('')
  const [previewBytes, setPreviewBytes] = useState<Uint8Array | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const docRef = useRef<PDFDocument | null>(null)
  const lastToken = useRef(0)
  const { status, message, run, reset, setMessage } = useAsyncTask()

  const acceptFiles = useCallback(async (files: File[]) => {
    const pdfs = files.filter(isPdfFile)
    if (!pdfs.length) throw new Error('Hãy chọn một file PDF để tách.')
    if (pdfs.length > 1) throw new Error('Chọn một file PDF mỗi lần để tách.')
    if (pdfs[0].size > LIMITS.maxFileBytes) throw new Error(sizeError(pdfs[0]))

    const rawBytes = new Uint8Array(await pdfs[0].arrayBuffer())
    const document = await loadPdf(pdfs[0])
    const pages = document.getPageCount()
    if (pages === 0) throw new Error(`"${pdfs[0].name}" không có trang nào.`)

    docRef.current = document
    setFile(pdfs[0])
    setPageCount(pages)
    setPreviewBytes(rawBytes)
    setPreviewOpen(false)
    setBaseName(pdfs[0].name.replace(/\.pdf$/i, ''))
    setPagesPerPart(Math.min(Math.max(1, Math.ceil(pages / 2)), pages))
    setCustomInput(pages >= 4 ? `1-${Math.floor(pages / 2)}, ${Math.floor(pages / 2) + 1}-${pages}` : `1-${pages}`)
  }, [])

  useEffect(() => {
    if (incoming.target === 'split' && incoming.token > lastToken.current && incoming.files.length) {
      lastToken.current = incoming.token
      void run(() => acceptFiles(incoming.files), 'Đã nạp file PDF. Chọn cách tách bên dưới.')
    }
  }, [incoming, acceptFiles, run])

  const { parts, error } = useMemo(() => {
    if (!pageCount) return { parts: [], error: null as string | null }
    if (mode === 'every') {
      return { parts: buildFixedParts(pageCount, 1), error: null }
    }
    if (mode === 'fixed') {
      if (!Number.isInteger(pagesPerPart) || pagesPerPart < 1) {
        return { parts: [], error: 'Nhập số trang mỗi phần từ 1 trở lên.' }
      }
      if (pagesPerPart > pageCount) {
        return { parts: [], error: `Tối đa ${pageCount} trang mỗi phần.` }
      }
      return { parts: buildFixedParts(pageCount, pagesPerPart), error: null }
    }
    return parseCustomParts(customInput, pageCount)
  }, [customInput, mode, pageCount, pagesPerPart])

  const busy = status === 'running'
  const stem = baseName.trim() || file?.name.replace(/\.pdf$/i, '') || 'tach-pdf'

  const handleSplit = useCallback(() => {
    void run(async () => {
      if (!docRef.current || !file) throw new Error('Hãy chọn file PDF trước.')
      if (error || !parts.length) throw new Error(error || 'Chưa có phần nào hợp lệ để tách.')
      const result = await splitPdfToArchive(docRef.current, parts, stem, (current, total) => {
        setMessage(`Đang tách phần ${current} / ${total}…`)
      })
      downloadBytes(
        result.bytes,
        result.filename,
        result.kind === 'zip' ? 'application/zip' : 'application/pdf',
      )
    }, parts.length > 1 ? `Đã tách thành ${parts.length} file và tải về (.zip).` : 'Đã tách và tải file PDF.')
  }, [error, file, parts, run, setMessage, stem])

  useEffect(() => {
    if (!active) return
    exportRef.current = handleSplit
    return () => {
      if (exportRef.current === handleSplit) exportRef.current = null
    }
  }, [active, exportRef, handleSplit])

  const clear = () => {
    reset()
    docRef.current = null
    setFile(null)
    setPageCount(0)
    setPreviewBytes(null)
    setPreviewOpen(false)
  }

  return (
    <section>
      <h2 className="sr-only">Tách PDF thành nhiều file</h2>

      <Dropzone
        accept=".pdf,application/pdf"
        multiple={false}
        title="Kéo file PDF cần chia nhỏ vào đây"
        hint="hoặc bấm để chọn · tách thành nhiều file PDF gọn trong 1 file .zip"
        onFiles={onFiles}
        busy={busy}
      />

      {file && pageCount > 0 && (
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
                <p className="mt-0.5 text-[11px] tabular text-muted">{pageCount} trang</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setPreviewOpen(true)} className="btn-ghost">
                Xem trang
              </button>
              <button type="button" onClick={clear} className="btn-ghost -mr-2">
                Chọn file khác
              </button>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Cách tách file</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Cách tách file">
                {MODES.map((option) => {
                  const selected = mode === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setMode(option.value)}
                      className={`min-h-11 rounded-card border px-3 py-2.5 text-left transition-colors duration-150 ${
                        selected
                          ? 'border-accent bg-accent-soft text-text'
                          : 'border-line bg-surface text-muted hover:border-line-strong hover:text-text'
                      }`}
                    >
                      <span className={`block text-[12px] font-semibold ${selected ? 'text-accent' : 'text-text'}`}>
                        {option.label}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-muted">{option.desc}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {mode === 'fixed' && (
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-faint">
                  Số trang trong mỗi file con
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    min={1}
                    max={pageCount}
                    value={Number.isFinite(pagesPerPart) ? pagesPerPart : ''}
                    onChange={(event) => setPagesPerPart(event.target.value === '' ? 0 : Number(event.target.value))}
                    className="h-11 w-20 rounded-control border border-line bg-surface px-2 text-center text-base tabular text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft sm:text-sm"
                  />
                  <span className="text-xs text-muted">trang / file (tổng {pageCount} trang)</span>
                </div>
              </label>
            )}

            {mode === 'custom' && (
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-faint">
                  Nhập các khoảng trang (cách nhau bằng dấu phẩy)
                </span>
                <input
                  type="text"
                  value={customInput}
                  onChange={(event) => setCustomInput(event.target.value)}
                  placeholder="Ví dụ: 1-4, 5-8, 9-12"
                  spellCheck={false}
                  className="h-11 w-full rounded-control border border-line bg-surface px-3 text-base text-text outline-none placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent-soft sm:text-[13px]"
                />
              </label>
            )}

            {error ? (
              <p className="text-xs text-danger">{error}</p>
            ) : (
              parts.length > 0 && (
                <div className="rounded-card border border-line bg-surface/60 px-3.5 py-2.5 text-xs text-muted">
                  <span className="font-medium text-text">Dự kiến xuất {parts.length} file: </span>
                  {parts.slice(0, 6).map((part, idx) => (
                    <span key={`${part.label}-${idx}`} className="inline-block mr-2 tabular">
                      #{idx + 1} (tr.{part.from === part.to ? part.from : `${part.from}–${part.to}`})
                    </span>
                  ))}
                  {parts.length > 6 && <span>… và {parts.length - 6} file nữa</span>}
                </div>
              )
            )}

            <label className="flex flex-col gap-1.5 border-t border-line pt-4">
              <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Tên bộ file tải về</span>
              <div className="flex h-11 items-center rounded-control border border-line bg-surface px-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft">
                <input
                  type="text"
                  aria-label="Tên bộ file tải về"
                  value={baseName}
                  onChange={(event) => setBaseName(event.target.value)}
                  placeholder="tach-pdf"
                  spellCheck={false}
                  className="min-h-11 min-w-0 flex-1 bg-transparent text-[13px] text-text outline-none placeholder:text-faint"
                />
                <span className="ml-2 shrink-0 text-[11px] text-faint">.{parts.length > 1 ? 'zip' : 'pdf'}</span>
              </div>
            </label>
          </div>

          <StickyActionBar
            busy={busy}
            disabled={!!error || parts.length === 0}
            label={parts.length > 1 ? 'Tách & tải ZIP' : 'Tải file PDF'}
            onAction={handleSplit}
            secondary={{ label: 'Xem trang', onClick: () => setPreviewOpen(true) }}
            summary={
              <>
                Tách thành <span className="font-semibold text-text">{parts.length}</span> file từ{' '}
                <span className="font-semibold text-text">{pageCount}</span> trang
              </>
            }
          />
        </>
      )}

      <PdfPreviewModal
        open={previewOpen}
        bytes={previewBytes}
        title="Xem số trang trước khi tách"
        onClose={() => setPreviewOpen(false)}
      />

      <StatusLine message={message} status={status} />
    </section>
  )
}
