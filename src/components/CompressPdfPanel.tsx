import { useCallback, useEffect, useRef, useState } from 'react'
import { useAsyncTask } from '../hooks/useAsyncTask'
import type { ExportRef } from '../hooks/useExportShortcut'
import {
  compressPdf,
  formatFileSize,
  splitPdfUnderSizeLimit,
  type CompressLevel,
  type CompressPdfResult,
} from '../lib/compressPdf'
import { downloadBytes } from '../lib/download'
import { isPdfFile, LIMITS, sizeError } from '../lib/errors'
import { outputName } from '../lib/exportOptions'
import { getPdfPageCount } from '../lib/pdf'
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

type CompressMode = 'level' | 'target'

const LEVELS: Array<{ value: CompressLevel; label: string; hint: string }> = [
  { value: 'light', label: 'Nhẹ', hint: 'Nét cao (~150 DPI), giảm dung lượng vừa' },
  { value: 'balanced', label: 'Cân bằng', hint: 'Rõ chữ để in & đọc, gọn file' },
  { value: 'aggressive', label: 'Mạnh · Zalo', hint: 'Nhẹ nhanh, gửi qua mạng mượt' },
  { value: 'extreme', label: 'Tối đa', hint: 'Giảm sâu nhất có thể' },
]

const TARGET_PRESETS = [1, 2, 5, 10]

export function CompressPdfPanel({ incoming, onFiles, active, exportRef }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [bytes, setBytes] = useState<Uint8Array | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [mode, setMode] = useState<CompressMode>('level')
  const [level, setLevel] = useState<CompressLevel>('balanced')
  const [targetMbInput, setTargetMbInput] = useState('2')
  const [grayscale, setGrayscale] = useState(false)
  const [filename, setFilename] = useState('')
  const [result, setResult] = useState<CompressPdfResult | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewBytes, setPreviewBytes] = useState<Uint8Array | null>(null)
  const lastToken = useRef(0)
  const { status, message, run, reset, setMessage } = useAsyncTask()

  const acceptFiles = useCallback(async (files: File[]) => {
    const pdfs = files.filter(isPdfFile)
    if (!pdfs.length) throw new Error('Hãy chọn một file PDF để nén.')
    if (pdfs.length > 1) throw new Error('Chọn một file PDF mỗi lần để nén.')
    if (pdfs[0].size > LIMITS.maxFileBytes) throw new Error(sizeError(pdfs[0]))

    const raw = new Uint8Array(await pdfs[0].arrayBuffer())
    const count = await getPdfPageCount(raw)
    if (count === 0) throw new Error(`"${pdfs[0].name}" không có trang nào.`)

    setFile(pdfs[0])
    setBytes(raw)
    setPageCount(count)
    setFilename(`${pdfs[0].name.replace(/\.pdf$/i, '')}-nen`)
    setResult(null)
    setPreviewBytes(raw)
    setPreviewOpen(false)
  }, [])

  useEffect(() => {
    if (incoming.target === 'compress' && incoming.token > lastToken.current && incoming.files.length) {
      lastToken.current = incoming.token
      void run(() => acceptFiles(incoming.files), 'Đã nạp file PDF. Chọn mức nén bên dưới.')
    }
  }, [incoming, acceptFiles, run])

  const parsedTargetMb = Number(targetMbInput.replace(',', '.'))
  const targetError =
    mode === 'target' && (!Number.isFinite(parsedTargetMb) || parsedTargetMb < 0.2)
      ? 'Nhập dung lượng mục tiêu từ 0.2 MB trở lên.'
      : null

  const busy = status === 'running'
  const outName = outputName(filename, file?.name.replace(/\.pdf$/i, '') ? `${file.name.replace(/\.pdf$/i, '')}-nen` : 'tai-lieu-nen')

  const handleCompress = useCallback(() => {
    void run(async () => {
      if (!bytes || !file) throw new Error('Hãy chọn file PDF trước.')
      if (targetError) throw new Error(targetError)

      const targetBytes = mode === 'target' ? Math.round(parsedTargetMb * 1_000_000) : null
      const compressed = await compressPdf(bytes, {
        level,
        targetBytes,
        grayscale,
        onProgress: setMessage,
      })

      setResult(compressed)
      setPreviewBytes(compressed.bytes)
      downloadBytes(compressed.bytes, outName)
    }, 'Đã nén xong và tải xuống file PDF.')
  }, [bytes, file, grayscale, level, mode, outName, parsedTargetMb, run, setMessage, targetError])

  const handleSplitFallback = () => {
    if (!result || !Number.isFinite(parsedTargetMb) || parsedTargetMb < 0.2) return
    const stem = outName.replace(/\.pdf$/i, '')
    void run(async () => {
      const limitBytes = Math.round(parsedTargetMb * 1_000_000)
      const splitRes = await splitPdfUnderSizeLimit(result.bytes, limitBytes, stem, setMessage)
      if (!splitRes) {
        throw new Error(`Có trang đơn vẫn vượt quá ${parsedTargetMb} MB — hãy tăng giới hạn MB lên chút nhé.`)
      }
      downloadBytes(
        splitRes.bytes,
        splitRes.filename,
        splitRes.kind === 'zip' ? 'application/zip' : 'application/pdf',
      )
    }, `Đã tách nhỏ thành các file ≤ ${parsedTargetMb} MB.`)
  }

  useEffect(() => {
    if (!active) return
    exportRef.current = handleCompress
    return () => {
      if (exportRef.current === handleCompress) exportRef.current = null
    }
  }, [active, exportRef, handleCompress])

  const clear = () => {
    reset()
    setFile(null)
    setBytes(null)
    setPageCount(0)
    setResult(null)
    setPreviewBytes(null)
    setPreviewOpen(false)
  }

  const savedPercent = result
    ? Math.max(0, Math.round(((result.originalBytes - result.finalBytes) / Math.max(1, result.originalBytes)) * 100))
    : 0

  return (
    <section>
      <h2 className="sr-only">Nén giảm dung lượng PDF</h2>

      <Dropzone
        accept=".pdf,application/pdf"
        multiple={false}
        title="Kéo file PDF cần giảm dung lượng vào đây"
        hint="hoặc bấm để chọn · nén gọn để gửi Zalo, email hoặc nộp cổng trực tuyến"
        onFiles={onFiles}
        busy={busy}
        compact={Boolean(file)}
      />

      {file && bytes && (
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
                <p className="mt-0.5 text-[11px] tabular text-muted">
                  {pageCount} trang · Gốc {formatFileSize(file.size)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setPreviewBytes(result?.bytes ?? bytes)
                  setPreviewOpen(true)
                }}
                className="btn-ghost"
              >
                Xem trang
              </button>
              <button type="button" onClick={clear} className="btn-ghost -mr-2">
                Chọn file khác
              </button>
            </div>
          </div>

          <div className="mt-5 space-y-5">
            <div>
              <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Chế độ nén</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Chế độ nén PDF">
                <button
                  type="button"
                  role="radio"
                  aria-checked={mode === 'level'}
                  onClick={() => setMode('level')}
                  className={`min-h-11 rounded-card border px-3 py-2.5 text-left transition-colors duration-150 ${
                    mode === 'level'
                      ? 'border-accent bg-accent-soft text-text'
                      : 'border-line bg-surface text-muted hover:border-line-strong hover:text-text'
                  }`}
                >
                  <span className={`block text-[12px] font-semibold ${mode === 'level' ? 'text-accent' : 'text-text'}`}>
                    Nén theo mức
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted">Chọn độ nét mong muốn (Nhẹ → Tối đa)</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={mode === 'target'}
                  onClick={() => setMode('target')}
                  className={`min-h-11 rounded-card border px-3 py-2.5 text-left transition-colors duration-150 ${
                    mode === 'target'
                      ? 'border-accent bg-accent-soft text-text'
                      : 'border-line bg-surface text-muted hover:border-line-strong hover:text-text'
                  }`}
                >
                  <span className={`block text-[12px] font-semibold ${mode === 'target' ? 'text-accent' : 'text-text'}`}>
                    Giới hạn dung lượng (MB)
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted">Tự điều chỉnh để vừa mốc MB yêu cầu</span>
                </button>
              </div>
            </div>

            {mode === 'level' ? (
              <div>
                <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Mức độ nén</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Mức độ nén">
                  {LEVELS.map((item) => {
                    const selected = level === item.value
                    return (
                      <button
                        key={item.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setLevel(item.value)}
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
            ) : (
              <div className="space-y-2">
                <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Mục tiêu tối đa (MB)</p>
                <div className="flex flex-wrap items-center gap-2">
                  {TARGET_PRESETS.map((mb) => {
                    const selected = parsedTargetMb === mb
                    return (
                      <button
                        key={mb}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setTargetMbInput(String(mb))}
                        className={`min-h-11 rounded-control border px-3 text-[12px] tabular transition-colors duration-150 ${
                          selected
                            ? 'border-accent bg-accent-soft font-semibold text-accent'
                            : 'border-line bg-surface text-muted hover:border-line-strong hover:text-text'
                        }`}
                      >
                        {mb} MB
                      </button>
                    )
                  })}
                  <div className="flex h-11 items-center rounded-control border border-line bg-surface px-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft">
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label="Dung lượng mục tiêu (MB)"
                      value={targetMbInput}
                      onChange={(event) => setTargetMbInput(event.target.value)}
                      className="h-11 w-16 bg-transparent text-center text-base tabular text-text outline-none sm:text-sm"
                    />
                    <span className="ml-1 text-[11px] text-faint">MB</span>
                  </div>
                </div>
                {targetError && <p className="text-xs text-danger">{targetError}</p>}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-pressed={grayscale}
                onClick={() => setGrayscale((prev) => !prev)}
                className={`min-h-11 rounded-control border px-3 text-[12px] transition-colors duration-150 ${
                  grayscale
                    ? 'border-accent bg-accent-soft font-semibold text-accent'
                    : 'border-line bg-surface text-muted hover:border-line-strong hover:text-text'
                }`}
              >
                {grayscale ? '✓ Đang bật: Đen trắng (Grayscale)' : 'Chuyển đen trắng (Grayscale)'}
              </button>
            </div>

            <label className="flex flex-col gap-1.5 border-t border-line pt-4">
              <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Tên file xuất</span>
              <div className="flex h-11 items-center rounded-control border border-line bg-surface px-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft">
                <input
                  type="text"
                  aria-label="Tên file xuất"
                  value={filename}
                  onChange={(event) => setFilename(event.target.value)}
                  placeholder="ten-file-nen"
                  spellCheck={false}
                  className="min-h-11 min-w-0 flex-1 bg-transparent text-[13px] text-text outline-none placeholder:text-faint"
                />
                <span className="ml-2 shrink-0 text-[11px] text-faint">.pdf</span>
              </div>
            </label>
          </div>

          <StickyActionBar
            busy={busy}
            disabled={!!targetError}
            label="Nén PDF"
            onAction={handleCompress}
            secondary={{
              label: 'Xem trang',
              onClick: () => {
                setPreviewBytes(result?.bytes ?? bytes)
                setPreviewOpen(true)
              },
            }}
            summary={
              <>
                File gốc <span className="font-semibold tabular text-text">{formatFileSize(file.size)}</span> ·{' '}
                {mode === 'target' ? `Mục tiêu ≤ ${Number.isFinite(parsedTargetMb) ? parsedTargetMb : '?'} MB` : LEVELS.find((l) => l.value === level)?.label}
              </>
            }
          />

          {result && (
            <div className="mt-5 rounded-card border border-line bg-surface p-4 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-text">
                    {formatFileSize(result.originalBytes)} → {formatFileSize(result.finalBytes)}
                    {savedPercent > 0 && <span className="ml-2 text-success">(-{savedPercent}%)</span>}
                  </p>
                  <p className="mt-1 text-[11px] text-muted">
                    {result.rasterized
                      ? 'Đã tối ưu lại hình ảnh từng trang để giảm dung lượng.'
                      : 'Đã tối ưu cấu trúc và giữ nguyên 100% lớp chữ gốc.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => downloadBytes(result.bytes, outName)}
                  className="btn-ghost border border-line px-3"
                >
                  Tải lại
                </button>
              </div>

              {mode === 'target' && !result.reachedTarget && (
                <div className="mt-3 border-t border-line pt-3">
                  <p className="text-[11px] text-danger">
                    File sau khi nén hết mức vẫn còn {formatFileSize(result.finalBytes)} (vượt mốc {parsedTargetMb} MB).
                  </p>
                  <button
                    type="button"
                    onClick={handleSplitFallback}
                    className="btn-ghost mt-2 border border-line px-3 text-accent"
                  >
                    Tách thành nhiều file ≤ {parsedTargetMb} MB (.zip)
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <PdfPreviewModal
        open={previewOpen}
        bytes={previewBytes}
        title="Xem trước PDF"
        onClose={() => setPreviewOpen(false)}
        onDownload={
          result
            ? () => {
                downloadBytes(result.bytes, outName)
                setPreviewOpen(false)
              }
            : undefined
        }
      />

      <StatusLine message={message} status={status} />
    </section>
  )
}
