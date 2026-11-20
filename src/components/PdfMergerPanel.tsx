import { useEffect, useRef, useState } from 'react'
import { useAsyncTask } from '../hooks/useAsyncTask'
import { usePdfRows } from '../hooks/usePdfRows'
import { downloadBytes } from '../lib/download'
import { LIMITS } from '../lib/errors'
import { mergeRows } from '../lib/pdf'
import { rangeIssue, totalPages } from '../lib/parse'
import type { IncomingFiles } from '../types'
import { Dropzone } from './Dropzone'
import { PdfRowItem } from './PdfRowItem'
import { StatusLine } from './StatusLine'

type Props = {
  incoming: IncomingFiles
  onFiles: (files: File[]) => void
}

export function PdfMergerPanel({ incoming, onFiles }: Props) {
  const { rows, loading, addFiles, updateRow, duplicateRow, removeRow, moveRow, reorderRow, getCache } = usePdfRows()
  const { status, message, run } = useAsyncTask()
  const [dragging, setDragging] = useState<string | null>(null)
  const extraInput = useRef<HTMLInputElement>(null)
  const lastToken = useRef(0)

  useEffect(() => {
    if (incoming.token > lastToken.current && incoming.files.length) {
      lastToken.current = incoming.token
      void run(() => addFiles(incoming.files), `Đã thêm ${incoming.files.length} file.`)
    }
  }, [incoming, addFiles, run])

  const invalid = rows.some((row) => rangeIssue(row.from, row.to, row.pageCount) !== null)
  const total = totalPages(rows)
  const sourceCount = new Set(rows.map((row) => row.fileId)).size
  const tooMany = total > LIMITS.maxOutputPages

  const handleExport = () => {
    void run(async () => {
      if (!rows.length) throw new Error('Hãy kéo ít nhất một file PDF.')
      if (invalid) throw new Error('Hãy sửa các khoảng trang trước khi xuất.')
      if (tooMany) throw new Error(`Tối đa ${LIMITS.maxOutputPages} trang mỗi lần xuất.`)
      const bytes = await mergeRows(rows, getCache())
      downloadBytes(bytes, 'ket-qua.pdf')
    }, `Đã xuất ${total} trang.`)
  }

  return (
    <section>
      <Dropzone
        accept=".pdf,application/pdf"
        multiple
        title="Kéo file PDF vào đây"
        hint="hoặc bấm để chọn · có thể chọn nhiều file"
        onFiles={onFiles}
      />

      {rows.length > 0 && (
        <>
          <div className="mt-6 flex items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-wide text-neutral-400">
              Thứ tự xuất {loading && <span className="normal-case tracking-normal">· đang đọc file…</span>}
            </p>
            <button
              type="button"
              onClick={() => extraInput.current?.click()}
              className="text-xs text-neutral-600 underline-offset-2 hover:text-neutral-950 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950"
            >
              + Thêm file
            </button>
            <input
              ref={extraInput}
              type="file"
              accept=".pdf,application/pdf"
              multiple
              className="hidden"
              onChange={(event) => {
                onFiles(Array.from(event.target.files ?? []))
                event.target.value = ''
              }}
            />
          </div>

          <ul className="mt-1">
            {rows.map((row) => (
              <PdfRowItem
                key={row.id}
                row={row}
                dragging={dragging === row.id}
                onUpdate={updateRow}
                onDuplicate={duplicateRow}
                onRemove={removeRow}
                onMove={moveRow}
                onDragStart={setDragging}
                onDrop={reorderRow}
              />
            ))}
          </ul>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-4">
            <p className="text-xs text-neutral-500">
              Tổng: <span className="font-medium tabular-nums text-neutral-950">{total}</span> trang từ{' '}
              <span className="tabular-nums">{sourceCount}</span> file
            </p>
            <button
              type="button"
              onClick={handleExport}
              disabled={invalid || tooMany || status === 'running'}
              className="rounded-md bg-neutral-950 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              {status === 'running' ? 'Đang xử lý…' : 'Xuất PDF'}
            </button>
          </div>
          {tooMany && <p className="mt-2 text-xs text-red-700">Tối đa {LIMITS.maxOutputPages} trang mỗi lần xuất.</p>}
        </>
      )}

      <StatusLine message={message} status={status} />
    </section>
  )
}
