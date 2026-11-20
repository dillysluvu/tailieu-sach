import { useCallback, useEffect, useRef, useState } from 'react'
import { useAsyncTask } from '../hooks/useAsyncTask'
import type { ExportRef } from '../hooks/useExportShortcut'
import { downloadBytes } from '../lib/download'
import { isDocxFile, LIMITS } from '../lib/errors'
import { rangeIssue } from '../lib/parse'
import { convertDocxToPdf, cropWordPdf } from '../lib/word'
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

export function WordPanel({ incoming, onFiles, active, exportRef }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [bytes, setBytes] = useState<Uint8Array | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [from, setFrom] = useState(1)
  const [to, setTo] = useState(1)
  const lastToken = useRef(0)
  const { status, message, run, reset } = useAsyncTask()

  const acceptFiles = useCallback(async (files: File[]) => {
    const docx = files.filter(isDocxFile)
    if (!docx.length) throw new Error('Chỉ hỗ trợ file .docx.')
    if (docx.length > 1) throw new Error('Chọn một file .docx mỗi lần.')
    if (docx[0].size > LIMITS.maxFileBytes) throw new Error('File vượt quá 25 MB.')
    const converted = await convertDocxToPdf(docx[0])
    setFile(docx[0])
    setBytes(converted.bytes)
    setPageCount(converted.pageCount)
    setFrom(1)
    setTo(converted.pageCount)
  }, [])

  useEffect(() => {
    if (incoming.token > lastToken.current && incoming.files.length) {
      lastToken.current = incoming.token
      void run(() => acceptFiles(incoming.files), 'Đã chuyển xong. Chọn khoảng trang nếu cần.')
    }
  }, [incoming, acceptFiles, run])

  const issue = bytes ? rangeIssue(from, to, pageCount) : null
  const busy = status === 'running'

  const handleDownload = useCallback(() => {
    if (!file || !bytes) return
    void run(async () => {
      const output = from === 1 && to === pageCount ? bytes : await cropWordPdf(bytes, from, to)
      downloadBytes(output, `${file.name.replace(/\.docx$/i, '')}.pdf`)
    }, 'Đã tải file PDF.')
  }, [bytes, file, from, pageCount, run, to])

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
      <h1 className="sr-only">Word sang PDF</h1>

      <Dropzone
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        multiple={false}
        title="Kéo file Word (.docx) vào đây"
        hint="hoặc bấm để chọn · chuyển sang PDF ngay lập tức"
        onFiles={onFiles}
        busy={busy}
      />

      {bytes && file && (
        <>
          <div className="mt-6 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium tracking-[-0.01em] text-text" title={file.name}>
                {file.name}
              </p>
              <p className="mt-0.5 text-[11px] tabular text-muted">{pageCount} trang · sẵn sàng</p>
            </div>
            <button type="button" onClick={clear} className="btn-ghost -mr-2">
              Chọn file khác
            </button>
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

          <StickyActionBar
            busy={busy}
            disabled={!!issue}
            label="Tải PDF"
            onAction={handleDownload}
            summary={
              <>
                Giữ <span className="font-semibold text-text">{Math.max(0, to - from + 1)}</span> / {pageCount} trang
              </>
            }
          />
        </>
      )}

      <StatusLine message={message} status={status} />
    </section>
  )
}
