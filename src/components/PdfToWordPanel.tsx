import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAsyncTask } from '../hooks/useAsyncTask'
import type { ExportRef } from '../hooks/useExportShortcut'
import { downloadBytes } from '../lib/download'
import { isImageFile, isPdfFile, LIMITS, sizeError } from '../lib/errors'
import { outputName } from '../lib/exportOptions'
import { getPdfPageCount } from '../lib/pdf'
import { rangeIssue } from '../lib/parse'
import {
  checkAiServerStatus,
  convertOfflineToDocx,
  convertWithAi,
  markdownToDocxBytes,
  type AiServerStatus,
  type ConvertMode,
  type PdfToWordResult,
  type SubjectPreset,
} from '../lib/pdfToWord'
import type { IncomingFiles } from '../types'
import { Dropzone } from './Dropzone'
import { PdfPreviewModal } from './PdfPreviewModal'
import { RangeInputs } from './RangeInputs'
import { StickyActionBar } from './StickyActionBar'
import { StatusLine } from './StatusLine'

type Props = {
  incoming: IncomingFiles
  onFiles: (files: File[]) => void
  active: boolean
  exportRef: ExportRef
}

const SUBJECTS: Array<{ value: SubjectPreset; label: string; hint: string }> = [
  { value: 'math', label: 'Toán học', hint: 'Giữ công thức, phân số, căn thức & trắc nghiệm' },
  { value: 'literature', label: 'Ngữ Văn', hint: 'Giữ đoạn thơ, trích dẫn & bố cục Đọc hiểu' },
  { value: 'general', label: 'Chung', hint: 'Tài liệu, bảng biểu, phiếu bài tập thông thường' },
]

const PIN_KEY = 'ts-ai-pin'
const GEMINI_KEY_STORAGE = 'ts-gemini-key'
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export function PdfToWordPanel({ incoming, onFiles, active, exportRef }: Props) {
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null)
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [pageCount, setPageCount] = useState(0)
  const [from, setFrom] = useState(1)
  const [to, setTo] = useState(1)
  const [mode, setMode] = useState<ConvertMode>('ai')
  const [modeTouched, setModeTouched] = useState(false)
  const [subject, setSubject] = useState<SubjectPreset>('math')
  const [filename, setFilename] = useState('')
  const [aiStatus, setAiStatus] = useState<AiServerStatus>({ aiConfigured: false, pinRequired: false })
  const [pin, setPin] = useState(() => {
    try {
      return localStorage.getItem(PIN_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const [geminiKey, setGeminiKey] = useState(() => {
    try {
      return localStorage.getItem(GEMINI_KEY_STORAGE) ?? ''
    } catch {
      return ''
    }
  })
  const [showKeyBox, setShowKeyBox] = useState(false)
  const [result, setResult] = useState<PdfToWordResult | null>(null)
  const [editedMarkdown, setEditedMarkdown] = useState('')
  const [copied, setCopied] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const lastToken = useRef(0)
  const { status, message, run, reset, setMessage } = useAsyncTask()

  useEffect(() => {
    let cancelled = false
    void checkAiServerStatus().then((next) => {
      if (cancelled) return
      setAiStatus(next)
      if (!next.aiConfigured && !geminiKey.trim() && !modeTouched && !imageFiles.length) {
        setMode('offline')
      }
    })
    return () => {
      cancelled = true
    }
  }, [geminiKey, imageFiles.length, modeTouched])

  const acceptFiles = useCallback(
    async (files: File[]) => {
      const pdfs = files.filter(isPdfFile)
      const images = files.filter(isImageFile)

      if (pdfs.length) {
        if (pdfs.length > 1) throw new Error('Chọn một file PDF mỗi lần.')
        if (pdfs[0].size > LIMITS.maxFileBytes) throw new Error(sizeError(pdfs[0]))
        const raw = new Uint8Array(await pdfs[0].arrayBuffer())
        const count = await getPdfPageCount(raw)
        if (count === 0) throw new Error(`"${pdfs[0].name}" không có trang nào.`)

        setImageFiles([])
        setPdfFile(pdfs[0])
        setPdfBytes(raw)
        setPageCount(count)
        setFrom(1)
        setTo(Math.min(count, 10))
        setFilename(pdfs[0].name.replace(/\.pdf$/i, ''))
        setResult(null)
        setEditedMarkdown('')
        if (!modeTouched) {
          setMode(aiStatus.aiConfigured || geminiKey.trim() ? 'ai' : 'offline')
        }
        return
      }

      if (images.length) {
        if (images.length > 10) throw new Error('Chế độ ảnh chụp sách hỗ trợ tối đa 10 ảnh mỗi lần.')
        const oversized = images.find((img) => img.size > LIMITS.maxFileBytes)
        if (oversized) throw new Error(sizeError(oversized))
        setPdfFile(null)
        setPdfBytes(null)
        setPageCount(images.length)
        setImageFiles(images)
        setMode('ai')
        setFilename(images[0].name.replace(/\.(jpe?g|png|webp)$/i, ''))
        setResult(null)
        setEditedMarkdown('')
        return
      }

      throw new Error('Hãy chọn file PDF hoặc ảnh chụp trang sách (JPG, PNG, WebP).')
    },
    [aiStatus.aiConfigured, geminiKey, modeTouched],
  )

  useEffect(() => {
    if (incoming.target === 'pdf2word' && incoming.token > lastToken.current && incoming.files.length) {
      lastToken.current = incoming.token
      void run(() => acceptFiles(incoming.files), 'Đã nạp tài liệu. Chọn chế độ và bấm Chuyển sang Word.')
    }
  }, [incoming, acceptFiles, run])

  const hasSource = Boolean(pdfBytes || imageFiles.length)
  const isPhotoSource = imageFiles.length > 0
  const issue = pdfBytes ? rangeIssue(from, to, pageCount) : null
  const pages = useMemo(() => {
    if (isPhotoSource) return Array.from({ length: imageFiles.length }, (_, idx) => idx + 1)
    if (issue || !pageCount) return []
    return Array.from({ length: to - from + 1 }, (_, idx) => from + idx)
  }, [from, imageFiles.length, isPhotoSource, issue, pageCount, to])

  const tooManyAiPages = mode === 'ai' && pages.length > 15
  const busy = status === 'running'
  const outName = outputName(filename, pdfFile?.name.replace(/\.pdf$/i, '') ?? 'tai-lieu-word', 'docx')

  const handlePinChange = (next: string) => {
    setPin(next)
    try {
      if (next) localStorage.setItem(PIN_KEY, next)
      else localStorage.removeItem(PIN_KEY)
    } catch {
      /* bỏ qua nếu trình duyệt chặn localStorage */
    }
  }

  const handleGeminiKeyChange = (next: string) => {
    setGeminiKey(next)
    try {
      if (next.trim()) localStorage.setItem(GEMINI_KEY_STORAGE, next.trim())
      else localStorage.removeItem(GEMINI_KEY_STORAGE)
    } catch {
      /* bỏ qua nếu trình duyệt chặn localStorage */
    }
  }

  const handleConvert = useCallback(() => {
    void run(async () => {
      if (!hasSource) throw new Error('Hãy kéo file PDF hoặc ảnh chụp bài tập vào trước.')
      if (issue) throw new Error(issue)
      if (tooManyAiPages) throw new Error('Chế độ AI nên chọn tối đa 15 trang mỗi lượt để chạy nhanh và chuẩn nhất.')

      const converted =
        mode === 'ai' || isPhotoSource
          ? await convertWithAi({
              pdfBytes,
              imageFiles: isPhotoSource ? imageFiles : undefined,
              pages,
              subject,
              pin: pin.trim(),
              geminiKey: geminiKey.trim() || undefined,
              onProgress: setMessage,
            })
          : await convertOfflineToDocx(pdfBytes!, pages, setMessage)

      setResult(converted)
      setEditedMarkdown(converted.markdown)
      downloadBytes(converted.docxBytes, outName, DOCX_MIME)
    }, 'Đã chuyển sang Word (.docx) và tải xuống!')
  }, [
    geminiKey,
    hasSource,
    imageFiles,
    isPhotoSource,
    issue,
    mode,
    outName,
    pages,
    pdfBytes,
    pin,
    run,
    setMessage,
    subject,
    tooManyAiPages,
  ])

  const handleDownloadEdited = () => {
    if (!result) return
    if (editedMarkdown === result.markdown) {
      downloadBytes(result.docxBytes, outName, DOCX_MIME)
      return
    }
    void run(async () => {
      const updated = await markdownToDocxBytes(editedMarkdown)
      setResult({ ...result, markdown: editedMarkdown, docxBytes: updated })
      downloadBytes(updated, outName, DOCX_MIME)
    }, 'Đã cập nhật nội dung và tải lại file Word (.docx)!')
  }

  useEffect(() => {
    if (!active) return
    exportRef.current = handleConvert
    return () => {
      if (exportRef.current === handleConvert) exportRef.current = null
    }
  }, [active, exportRef, handleConvert])

  const clear = () => {
    reset()
    setPdfFile(null)
    setPdfBytes(null)
    setImageFiles([])
    setPageCount(0)
    setResult(null)
    setEditedMarkdown('')
    setPreviewOpen(false)
  }

  const copyText = async () => {
    if (!editedMarkdown) return
    await navigator.clipboard.writeText(editedMarkdown)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  const hasEdited = Boolean(result && editedMarkdown !== result.markdown)

  return (
    <section>
      <h2 className="sr-only">Chuyển PDF sang Word</h2>

      <Dropzone
        accept=".pdf,application/pdf,.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        multiple
        title="Kéo file PDF hoặc ảnh chụp trang sách vào đây"
        hint="hỗ trợ cả đề Toán có công thức, bài Văn, PDF scan & ảnh chụp điện thoại"
        onFiles={onFiles}
        busy={busy}
        compact={hasSource}
      />

      {hasSource && (
        <>
          <div className="mt-6 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <span className="mt-0.5 shrink-0 rounded bg-accent-soft px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.08em] text-accent">
                {isPhotoSource ? 'ẢNH' : 'PDF'}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium tracking-[-0.01em] text-text">
                  {pdfFile ? pdfFile.name : `${imageFiles.length} ảnh chụp tài liệu`}
                </p>
                <p className="mt-0.5 text-[11px] tabular text-muted">
                  {isPhotoSource ? `${imageFiles.length} trang ảnh` : `${pageCount} trang`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {pdfBytes && (
                <button type="button" onClick={() => setPreviewOpen(true)} className="btn-ghost">
                  Xem trang
                </button>
              )}
              <button type="button" onClick={clear} className="btn-ghost -mr-2">
                Chọn file khác
              </button>
            </div>
          </div>

          <div className="mt-5 space-y-5">
            <div>
              <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Chế độ chuyển đổi</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Chế độ chuyển sang Word">
                <button
                  type="button"
                  role="radio"
                  aria-checked={mode === 'ai'}
                  onClick={() => {
                    setModeTouched(true)
                    setMode('ai')
                  }}
                  className={`min-h-11 rounded-card border px-3 py-2.5 text-left transition-colors duration-150 ${
                    mode === 'ai'
                      ? 'border-accent bg-accent-soft text-text'
                      : 'border-line bg-surface text-muted hover:border-line-strong'
                  }`}
                >
                  <span className={`block text-[12px] font-semibold ${mode === 'ai' ? 'text-accent' : 'text-text'}`}>
                    AI Toán – Văn {aiStatus.aiConfigured ? '(Sẵn sàng)' : '(Cần API Key)'}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted">
                    Giữ công thức Toán sửa được trong Word, bảng &amp; đọc được bản scan
                  </span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={mode === 'offline'}
                  disabled={isPhotoSource}
                  onClick={() => {
                    setModeTouched(true)
                    setMode('offline')
                  }}
                  className={`min-h-11 rounded-card border px-3 py-2.5 text-left transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${
                    mode === 'offline'
                      ? 'border-accent bg-accent-soft text-text'
                      : 'border-line bg-surface text-muted hover:border-line-strong'
                  }`}
                >
                  <span className={`block text-[12px] font-semibold ${mode === 'offline' ? 'text-accent' : 'text-text'}`}>
                    Nhanh trên máy (Offline)
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted">
                    Không cần mạng/API · giữ chữ đậm/nghiêng, bảng/đáp án A B C D &amp; trang scan
                  </span>
                </button>
              </div>
            </div>

            {mode === 'ai' && (
              <div className="space-y-3">
                <div>
                  <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Môn học (tối ưu giữ định dạng)</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {SUBJECTS.map((item) => {
                      const selected = subject === item.value
                      return (
                        <button
                          key={item.value}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => setSubject(item.value)}
                          className={`min-h-11 rounded-control border px-3 py-2 text-left transition-colors duration-150 ${
                            selected
                              ? 'border-accent bg-accent-soft text-text'
                              : 'border-line bg-surface text-muted hover:border-line-strong'
                          }`}
                        >
                          <span className={`block text-[12px] font-semibold ${selected ? 'text-accent' : 'text-text'}`}>
                            {item.label}
                          </span>
                          <span className="block text-[10.5px] text-muted">{item.hint}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {aiStatus.pinRequired && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowKeyBox((value) => !value)}
                      className="btn-ghost -ml-2 h-11 text-[11px] text-muted"
                    >
                      {pin ? '🔑 Đã lưu mã khóa AI (bấm để đổi)' : '🔑 Nhập mã khóa PIN dùng AI'}
                    </button>
                    {showKeyBox && (
                      <input
                        type="password"
                        value={pin}
                        onChange={(event) => handlePinChange(event.target.value)}
                        placeholder="Nhập mã PIN riêng (tự lưu cho lần sau)"
                        autoComplete="off"
                        className="mt-1 h-11 w-full rounded-control border border-line bg-surface px-3 text-base text-text outline-none placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent-soft sm:max-w-xs sm:text-[13px]"
                      />
                    )}
                  </div>
                )}

                {!aiStatus.aiConfigured && (
                  <div className="rounded-card border border-line bg-surface p-3">
                    <button
                      type="button"
                      onClick={() => setShowKeyBox((value) => !value)}
                      className="btn-ghost -ml-2 h-11 text-[11px] text-text"
                    >
                      {geminiKey
                        ? '🔑 Đã lưu Gemini API Key cá nhân (bấm để đổi)'
                        : '🔑 Dán Gemini API Key miễn phí để dùng chế độ AI Toán – Văn'}
                    </button>
                    {(showKeyBox || !geminiKey) && (
                      <div className="mt-1 space-y-1.5">
                        <input
                          type="password"
                          value={geminiKey}
                          onChange={(event) => handleGeminiKeyChange(event.target.value)}
                          placeholder="AIza... (lưu ngay trên trình duyệt, không lưu lên server)"
                          autoComplete="off"
                          className="h-11 w-full rounded-control border border-line bg-bg px-3 text-base text-text outline-none placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent-soft sm:max-w-md sm:text-[13px]"
                        />
                        <p className="text-[11px] text-muted">
                          Nếu chưa có Key, bạn hãy chọn chế độ <strong>Nhanh trên máy (Offline)</strong> ở trên để chuyển đổi ngay không cần mạng.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {pdfBytes && (
              <div>
                <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.1em] text-faint">
                  Chọn đúng trang cần chuyển {mode === 'ai' && '(nên ≤ 15 trang / lượt)'}
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
                {tooManyAiPages && (
                  <p className="mt-2 text-[11px] text-danger">
                    Đang chọn {pages.length} trang — hãy chia mỗi lượt tối đa 15 trang để AI giữ công thức chuẩn nhất.
                  </p>
                )}
              </div>
            )}

            <label className="flex flex-col gap-1.5 border-t border-line pt-4">
              <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Tên file Word xuất ra</span>
              <div className="flex h-11 items-center rounded-control border border-line bg-surface px-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft">
                <input
                  type="text"
                  aria-label="Tên file Word xuất ra"
                  value={filename}
                  onChange={(event) => setFilename(event.target.value)}
                  placeholder="tai-lieu-word"
                  spellCheck={false}
                  className="min-h-11 min-w-0 flex-1 bg-transparent text-[13px] text-text outline-none placeholder:text-faint"
                />
                <span className="ml-2 shrink-0 text-[11px] text-faint">.docx</span>
              </div>
            </label>
          </div>

          <StickyActionBar
            busy={busy}
            disabled={!!issue || tooManyAiPages || pages.length === 0}
            label="Chuyển sang Word"
            onAction={handleConvert}
            secondary={pdfBytes ? { label: 'Xem trang', onClick: () => setPreviewOpen(true) } : undefined}
            summary={
              <>
                Chuyển <span className="font-semibold text-text">{pages.length}</span> trang ·{' '}
                <span className="font-medium text-text">{mode === 'ai' ? 'AI Toán–Văn' : 'Offline'}</span>
              </>
            }
          />

          {result && (
            <div className="mt-6 rounded-card border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                <div>
                  <p className="text-xs font-semibold text-text">Nội dung đã chuyển ({result.pageCount} trang)</p>
                  <p className="text-[11px] text-muted">Có thể sửa trực tiếp chữ hoặc công thức bên dưới rồi tải lại file Word.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={copyText} className="btn-ghost border border-line px-3">
                    {copied ? '✓ Đã chép' : 'Chép chữ'}
                  </button>
                  <button type="button" onClick={handleDownloadEdited} className="btn-primary px-4">
                    {hasEdited ? 'Cập nhật & Tải .docx' : 'Tải lại .docx'}
                  </button>
                </div>
              </div>
              <textarea
                aria-label="Nội dung văn bản đã nhận diện"
                value={editedMarkdown}
                onChange={(event) => setEditedMarkdown(event.target.value)}
                rows={10}
                spellCheck={false}
                className="mt-3 w-full resize-y rounded-control border border-line bg-bg p-3 font-sans text-xs leading-relaxed text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
              />
            </div>
          )}
        </>
      )}

      <PdfPreviewModal
        open={previewOpen}
        bytes={pdfBytes}
        title="Xem số trang trước khi chuyển sang Word"
        onClose={() => setPreviewOpen(false)}
      />

      <StatusLine message={message} status={status} />
    </section>
  )
}
