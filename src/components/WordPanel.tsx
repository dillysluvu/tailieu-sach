import { useCallback, useEffect, useRef, useState } from 'react'
import { useAsyncTask } from '../hooks/useAsyncTask'
import { downloadBytes } from '../lib/download'
import { isDocxFile, LIMITS } from '../lib/errors'
import { rangeIssue } from '../lib/parse'
import { convertDocxToPdf, cropWordPdf } from '../lib/word'
import type { IncomingFiles } from '../types'
import { Dropzone } from './Dropzone'
import { RangeInputs } from './RangeInputs'
import { StatusLine } from './StatusLine'

type Props = {
  incoming: IncomingFiles
  onFiles: (files: File[]) => void
}

export function WordPanel({ incoming, onFiles }: Props) {
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

  const handleDownload = () => {
    if (!file || !bytes) return
    void run(async () => {
      const output = from === 1 && to === pageCount ? bytes : await cropWordPdf(bytes, from, to)
      downloadBytes(output, `${file.name.replace(/\.docx$/i, '')}.pdf`)
    }, 'Đã tải file PDF.')
  }

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
      <Dropzone
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        multiple={false}
        title="Kéo file Word (.docx) vào đây"
        hint="hoặc bấm để chọn · chuyển sang PDF ngay lập tức"
        onFiles={onFiles}
      />

      {bytes && file && (
        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 pb-4">
            <div className="min-w-0">
              <p className="truncate text-sm" title={file.name}>
                {file.name}
              </p>
              <p className="text-xs tabular-nums text-neutral-500">{pageCount} trang · sẵn sàng</p>
            </div>
            <button
              type="button"
              onClick={clear}
              className="text-xs text-neutral-600 underline-offset-2 hover:text-neutral-950 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950"
            >
              Chọn file khác
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs text-neutral-500">Khoảng trang cần giữ</p>
              <div className="mt-2">
                <RangeInputs from={from} to={to} max={pageCount} onChange={(nextFrom, nextTo) => { setFrom(nextFrom); setTo(nextTo) }} />
              </div>
              {issue && <p className="mt-2 text-xs text-red-700">{issue}</p>}
            </div>
            <button
              type="button"
              onClick={handleDownload}
              disabled={!!issue || busy}
              className="rounded-md bg-neutral-950 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              {busy ? 'Đang xử lý…' : 'Tải PDF'}
            </button>
          </div>

          <p className="mt-5 text-xs text-neutral-400">
            Số trang được tính theo bản PDF A4 sau chuyển đổi — .docx không có trang cố định.
          </p>
        </div>
      )}

      <StatusLine message={message} status={status} />
    </section>
  )
}
