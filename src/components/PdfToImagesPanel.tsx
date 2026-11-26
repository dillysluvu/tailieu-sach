import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAsyncTask } from '../hooks/useAsyncTask'
import type { ExportRef } from '../hooks/useExportShortcut'
import { downloadBytes } from '../lib/download'
import { isPdfFile, LIMITS, sizeError } from '../lib/errors'
import { filterPages, type PagePreset } from '../lib/exportOptions'
import { getPdfPageCount } from '../lib/pdf'
import { rangeIssue } from '../lib/parse'
import {
  packImagesToZip,
  renderPdfPagesToImages,
  type ImageFormat,
  type ImageQualityScale,
  type RenderedPageImage,
} from '../lib/pdfToImages'
import type { IncomingFiles } from '../types'
import { Dropzone } from './Dropzone'
import { ExportOptions } from './ExportOptions'
import { RangeInputs } from './RangeInputs'
import { StickyActionBar } from './StickyActionBar'
import { StatusLine } from './StatusLine'

type Props = {
  incoming: IncomingFiles
  onFiles: (files: File[]) => void
  active: boolean
  exportRef: ExportRef
}

const FORMATS: Array<{ value: ImageFormat; label: string; hint: string }> = [
  { value: 'jpeg', label: 'JPG · Gửi Zalo nhanh', hint: 'Nhẹ, nét, tiện gửi học sinh' },
  { value: 'png', label: 'PNG · Siêu nét', hint: 'Rõ từng nét chữ nhỏ & hình vẽ' },
]

const QUALITIES: Array<{ value: ImageQualityScale; label: string }> = [
  { value: 1.5, label: 'Vừa' },
  { value: 2, label: 'Rõ nét (khuyên dùng)' },
  { value: 3, label: 'Siêu nét' },
]

export function PdfToImagesPanel({ incoming, onFiles, active, exportRef }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [bytes, setBytes] = useState<Uint8Array | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [from, setFrom] = useState(1)
  const [to, setTo] = useState(1)
  const [filename, setFilename] = useState('')
  const [preset, setPreset] = useState<PagePreset>('all')
  const [format, setFormat] = useState<ImageFormat>('jpeg')
  const [scale, setScale] = useState<ImageQualityScale>(2)
  const [gallery, setGallery] = useState<RenderedPageImage[]>([])
  const urlsRef = useRef<string[]>([])
  const lastToken = useRef(0)
  const { status, message, run, reset, setMessage } = useAsyncTask()

  const clearGallery = useCallback(() => {
    urlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    urlsRef.current = []
    setGallery([])
  }, [])

  useEffect(() => () => clearGallery(), [clearGallery])

  const acceptFiles = useCallback(
    async (files: File[]) => {
      const pdfs = files.filter(isPdfFile)
      if (!pdfs.length) throw new Error('Hãy chọn file PDF để chuyển sang ảnh.')
      if (pdfs.length > 1) throw new Error('Chọn một file PDF mỗi lần.')
      if (pdfs[0].size > LIMITS.maxFileBytes) throw new Error(sizeError(pdfs[0]))

      const raw = new Uint8Array(await pdfs[0].arrayBuffer())
      const count = await getPdfPageCount(raw)
      if (count === 0) throw new Error(`"${pdfs[0].name}" không có trang nào.`)

      clearGallery()
      setFile(pdfs[0])
      setBytes(raw)
      setPageCount(count)
      setFrom(1)
      setTo(count)
      setFilename(pdfs[0].name.replace(/\.pdf$/i, ''))
    },
    [clearGallery],
  )

  useEffect(() => {
    if (incoming.target === 'pdf2img' && incoming.token > lastToken.current && incoming.files.length) {
      lastToken.current = incoming.token
      void run(() => acceptFiles(incoming.files), 'Đã nạp file PDF. Chọn trang muốn xuất thành ảnh.')
    }
  }, [incoming, acceptFiles, run])

  const issue = bytes ? rangeIssue(from, to, pageCount) : null
  const selectedPages = useMemo(() => {
    if (issue || !pageCount) return []
    const list = Array.from({ length: to - from + 1 }, (_, index) => from + index)
    return filterPages(list, preset)
  }, [from, issue, pageCount, preset, to])

  const busy = status === 'running'
  const stem = filename.trim() || file?.name.replace(/\.pdf$/i, '') || 'anh-pdf'

  const handleExport = useCallback(() => {
    void run(async () => {
      if (!bytes || !file) throw new Error('Hãy chọn file PDF trước.')
      if (issue) throw new Error(issue)
      if (!selectedPages.length) throw new Error('Không có trang nào khớp với lựa chọn.')

      clearGallery()
      const images = await renderPdfPagesToImages(bytes, selectedPages, {
        format,
        scale,
        baseStem: stem,
        onProgress: (done, total) => setMessage(`Đang xuất ảnh trang ${done} / ${total}…`),
      })

      urlsRef.current = images.map((item) => item.url)
      setGallery(images)

      if (images.length === 1) {
        downloadBytes(images[0].bytes, images[0].filename, images[0].mimeType)
      } else {
        setMessage('Đang nén các ảnh thành file .zip…')
        const zip = await packImagesToZip(images)
        downloadBytes(zip, `${stem}.zip`, 'application/zip')
      }
    }, selectedPages.length === 1 ? 'Đã tải xong ảnh.' : `Đã xuất ${selectedPages.length} ảnh (.zip) — có thể tải lẻ bên dưới.`)
  }, [bytes, clearGallery, file, format, issue, run, scale, selectedPages, setMessage, stem])

  useEffect(() => {
    if (!active) return
    exportRef.current = handleExport
    return () => {
      if (exportRef.current === handleExport) exportRef.current = null
    }
  }, [active, exportRef, handleExport])

  const clear = () => {
    reset()
    clearGallery()
    setFile(null)
    setBytes(null)
    setPageCount(0)
  }

  return (
    <section>
      <h2 className="sr-only">Chuyển PDF sang ảnh</h2>

      <Dropzone
        accept=".pdf,application/pdf"
        multiple={false}
        title="Kéo file PDF muốn đổi ra ảnh vào đây"
        hint="hoặc bấm để chọn · xuất ảnh sắc nét gửi thẳng cho học sinh qua Zalo"
        onFiles={onFiles}
        busy={busy}
        compact={Boolean(file)}
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
                <p className="mt-0.5 text-[11px] tabular text-muted">{pageCount} trang</p>
              </div>
            </div>
            <button type="button" onClick={clear} className="btn-ghost -mr-2">
              Chọn file khác
            </button>
          </div>

          <div className="mt-5 space-y-5">
            <div>
              <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Khoảng trang muốn lấy</p>
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Định dạng ảnh</p>
                <div className="flex flex-col gap-2">
                  {FORMATS.map((item) => {
                    const selected = format === item.value
                    return (
                      <button
                        key={item.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setFormat(item.value)}
                        className={`min-h-11 rounded-control border px-3 py-2 text-left transition-colors duration-150 ${
                          selected
                            ? 'border-accent bg-accent-soft text-text'
                            : 'border-line bg-surface text-muted hover:border-line-strong'
                        }`}
                      >
                        <span className={`block text-[12px] font-semibold ${selected ? 'text-accent' : 'text-text'}`}>
                          {item.label}
                        </span>
                        <span className="block text-[11px] text-muted">{item.hint}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Độ nét</p>
                <div className="flex flex-wrap gap-2">
                  {QUALITIES.map((item) => {
                    const selected = scale === item.value
                    return (
                      <button
                        key={item.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setScale(item.value)}
                        className={`min-h-11 rounded-control border px-3 text-[12px] transition-colors duration-150 ${
                          selected
                            ? 'border-accent bg-accent-soft font-semibold text-accent'
                            : 'border-line bg-surface text-muted hover:border-line-strong hover:text-text'
                        }`}
                      >
                        {item.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          <ExportOptions
            filename={filename}
            onFilename={setFilename}
            preset={preset}
            onPreset={setPreset}
            extension={selectedPages.length > 1 ? 'zip' : format === 'png' ? 'png' : 'jpg'}
          />

          <StickyActionBar
            busy={busy}
            disabled={!!issue || selectedPages.length === 0}
            label={selectedPages.length > 1 ? `Xuất ${selectedPages.length} ảnh (.zip)` : 'Xuất ảnh'}
            onAction={handleExport}
            summary={
              <>
                Sẽ xuất <span className="font-semibold text-text">{selectedPages.length}</span> / {pageCount} trang thành{' '}
                <span className="font-semibold uppercase text-text">{format === 'png' ? 'PNG' : 'JPG'}</span>
              </>
            }
          />

          {gallery.length > 0 && (
            <div className="mt-6 border-t border-line pt-5">
              <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.1em] text-faint">
                Ảnh đã xuất ({gallery.length}) — bấm để lưu riêng từng trang
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {gallery.map((item) => (
                  <div
                    key={item.pageNumber}
                    className="overflow-hidden rounded-card border border-line bg-surface p-2"
                  >
                    <img
                      src={item.url}
                      alt={`Trang ${item.pageNumber}`}
                      className="aspect-[3/4] w-full rounded bg-bg object-contain"
                    />
                    <div className="mt-2 flex items-center justify-between gap-1">
                      <span className="text-[11px] tabular text-muted">Trang {item.pageNumber}</span>
                      <button
                        type="button"
                        onClick={() => downloadBytes(item.bytes, item.filename, item.mimeType)}
                        className="btn-ghost h-11 px-2 text-[11px] font-medium text-accent"
                      >
                        Lưu ảnh
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <StatusLine message={message} status={status} />
    </section>
  )
}
