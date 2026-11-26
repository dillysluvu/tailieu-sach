import { useCallback, useEffect, useRef, useState } from 'react'
import { useAsyncTask } from '../hooks/useAsyncTask'
import type { ExportRef } from '../hooks/useExportShortcut'
import { downloadBytes } from '../lib/download'
import { isDocxFile, LIMITS, sizeError } from '../lib/errors'
import { filterPages, outputName, type PagePreset } from '../lib/exportOptions'
import { extractPages } from '../lib/pdf'
import { rangeIssue } from '../lib/parse'
import { convertDocxToPdf, printWordAsVectorPdf } from '../lib/word'
import type { IncomingFiles } from '../types'
import { Dropzone } from './Dropzone'
import { ExportOptions } from './ExportOptions'
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

export function WordPanel({ incoming, onFiles, active, exportRef }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [bytes, setBytes] = useState<Uint8Array | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [from, setFrom] = useState(1)
  const [to, setTo] = useState(1)
  const [filename, setFilename] = useState('')
  const [preset, setPreset] = useState<PagePreset>('all')
  const [printHtml, setPrintHtml] = useState('')
  const [previewBytes, setPreviewBytes] = useState<Uint8Array | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const lastToken = useRef(0)
  const outputCache = useRef<{ key: string; source: Uint8Array; bytes: Uint8Array } | null>(null)
  const { status, message, run, reset, setMessage } = useAsyncTask()

  const acceptFiles = useCallback(
    async (files: File[]) => {
      const docx = files.filter(isDocxFile)
      if (!docx.length) throw new Error('Chỉ hỗ trợ file .docx.')
      if (docx.length > 1) throw new Error('Chọn một file .docx mỗi lần.')
      if (docx[0].size > LIMITS.maxFileBytes) throw new Error(sizeError(docx[0]))
      const converted = await convertDocxToPdf(docx[0], setMessage)
      setFile(docx[0])
      setBytes(converted.bytes)
      setPageCount(converted.pageCount)
      setPrintHtml(converted.printHtml)
      setFrom(1)
      setTo(converted.pageCount)
      setPreviewBytes(null)
      setPreviewOpen(false)
      outputCache.current = null
    },
    [setMessage],
  )

  useEffect(() => {
    if (incoming.target === 'word' && incoming.token > lastToken.current && incoming.files.length) {
      lastToken.current = incoming.token
      void run(() => acceptFiles(incoming.files), 'Đã chuyển xong. Chọn khoảng trang nếu cần.')
    }
  }, [incoming, acceptFiles, run])

  const issue = bytes ? rangeIssue(from, to, pageCount) : null
  const busy = status === 'running'
  const rangePages = issue || !pageCount ? [] : Array.from({ length: to - from + 1 }, (_, index) => from + index)
  const selectedPages = filterPages(rangePages, preset)
  const signature = `${bytes?.byteLength ?? 0}:${from}:${to}:${preset}`
  const name = outputName(filename, file?.name.replace(/\.docx$/i, '') ?? 'ket-qua')

  const buildOutput = useCallback(async () => {
    if (!bytes) throw new Error('Hãy kéo file Word trước.')
    if (issue) throw new Error(issue)
    const cached = outputCache.current
    if (cached && cached.key === signature && cached.source === bytes) return cached.bytes
    const full = preset === 'all' && from === 1 && to === pageCount
    const output = full ? bytes : await extractPages(bytes, selectedPages)
    outputCache.current = { key: signature, source: bytes, bytes: output }
    return output
  }, [bytes, from, issue, pageCount, preset, selectedPages, signature, to])

  const handleDownload = useCallback(() => {
    void run(async () => {
      const output = await buildOutput()
      downloadBytes(output, name)
    }, 'Đã tải file PDF.')
  }, [buildOutput, name, run])

  const handlePreview = useCallback(() => {
    void run(async () => {
      setPreviewBytes(await buildOutput())
      setPreviewOpen(true)
    }, 'Đã dựng xong bản xem trước.')
  }, [buildOutput, run])

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
    setPrintHtml('')
    setFrom(1)
    setTo(1)
    setPreviewBytes(null)
    setPreviewOpen(false)
    outputCache.current = null
  }

  return (
    <section>
      <h2 className="sr-only">Word sang PDF</h2>

      <Dropzone
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        multiple={false}
        title="Kéo file Word (.docx) vào đây"
        hint="hoặc bấm để chọn · chuyển sang PDF ngay lập tức"
        onFiles={onFiles}
        busy={busy}
        compact={Boolean(file)}
      />

      {bytes && file && (
        <>
          <div className="mt-6 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <span className="mt-0.5 shrink-0 rounded bg-accent-soft px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.08em] text-accent">
                DOCX
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium tracking-[-0.01em] text-text" title={file.name}>
                  {file.name}
                </p>
                <p className="mt-0.5 text-[11px] tabular text-muted">{pageCount} trang · sẵn sàng</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {printHtml && (
                <button
                  type="button"
                  onClick={() => printWordAsVectorPdf(printHtml, name.replace(/\.pdf$/i, ''))}
                  className="btn-ghost"
                  title="Mở hộp thoại Lưu thành PDF của máy để giữ nguyên chữ chọn được (Vector)"
                >
                  In / PDF nét chữ
                </button>
              )}
              <button type="button" onClick={clear} className="btn-ghost -mr-2">
                Chọn file khác
              </button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-end justify-between gap-4 md:gap-6">
            <div>
              <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.1em] text-faint">
                Khoảng trang cần giữ
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
            Số trang được tính theo bản PDF A4 sau chuyển đổi — .docx không có trang cố định.
          </p>

          <ExportOptions filename={filename} onFilename={setFilename} preset={preset} onPreset={setPreset} />

          <StickyActionBar
            busy={busy}
            disabled={!!issue || selectedPages.length === 0}
            label="Tải PDF"
            onAction={handleDownload}
            secondary={{ label: 'Xem trước', onClick: handlePreview }}
            summary={
              <>
                Giữ <span className="font-semibold text-text">{selectedPages.length}</span> / {pageCount} trang
              </>
            }
          />
        </>
      )}

      <PdfPreviewModal
        open={previewOpen}
        bytes={previewBytes}
        title="Xem trước PDF từ Word"
        onClose={() => setPreviewOpen(false)}
        onDownload={() => {
          if (previewBytes) downloadBytes(previewBytes, name)
          setPreviewOpen(false)
        }}
      />

      <StatusLine message={message} status={status} />
    </section>
  )
}
