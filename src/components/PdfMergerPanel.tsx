import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { useAsyncTask } from '../hooks/useAsyncTask'
import type { ExportRef } from '../hooks/useExportShortcut'
import { usePdfRows } from '../hooks/usePdfRows'
import { downloadBytes } from '../lib/download'
import { LIMITS } from '../lib/errors'
import { mergeRows } from '../lib/pdf'
import { rangeIssue, totalPages } from '../lib/parse'
import type { IncomingFiles } from '../types'
import { Dropzone } from './Dropzone'
import { PdfPreviewModal } from './PdfPreviewModal'
import { PdfRowItem } from './PdfRowItem'
import { StickyActionBar } from './StickyActionBar'
import { StatusLine } from './StatusLine'

type Props = {
  incoming: IncomingFiles
  onFiles: (files: File[]) => void
  active: boolean
  exportRef: ExportRef
}

export function PdfMergerPanel({ incoming, onFiles, active, exportRef }: Props) {
  const { rows, loading, addFiles, updateRow, duplicateRow, removeRow, moveRow, reorderRow, getCache } = usePdfRows()
  const { status, message, run } = useAsyncTask()
  const [dragging, setDragging] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [previewBytes, setPreviewBytes] = useState<Uint8Array | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
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

  const handleExport = useCallback(() => {
    void run(async () => {
      if (!rows.length) throw new Error('Hãy kéo ít nhất một file PDF.')
      if (invalid) throw new Error('Hãy sửa các khoảng trang trước khi xuất.')
      if (tooMany) throw new Error(`Tối đa ${LIMITS.maxOutputPages} trang mỗi lần xuất.`)
      const bytes = await mergeRows(rows, getCache())
      downloadBytes(bytes, 'ket-qua.pdf')
    }, `Đã xuất ${total} trang.`)
  }, [getCache, invalid, rows, run, tooMany, total])

  const handlePreview = useCallback(() => {
    void run(async () => {
      if (!rows.length) throw new Error('Hãy kéo ít nhất một file PDF.')
      if (invalid) throw new Error('Hãy sửa các khoảng trang trước khi xem.')
      if (tooMany) throw new Error(`Tối đa ${LIMITS.maxOutputPages} trang mỗi lần xuất.`)
      const bytes = await mergeRows(rows, getCache())
      setPreviewBytes(bytes)
      setPreviewOpen(true)
    }, 'Đã dựng xong bản xem trước.')
  }, [getCache, invalid, rows, run, tooMany])

  useEffect(() => {
    if (!active) return
    exportRef.current = handleExport
    return () => {
      if (exportRef.current === handleExport) exportRef.current = null
    }
  }, [active, exportRef, handleExport])

  const announce = (text: string) => setAnnouncement(text)

  return (
    <section>
      <h2 className="sr-only">Cắt & gộp PDF</h2>

      <Dropzone
        accept=".pdf,application/pdf"
        multiple
        title="Kéo file PDF vào đây"
        hint="hoặc bấm để chọn · có thể chọn nhiều file"
        onFiles={onFiles}
        busy={status === 'running'}
      />

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {rows.length > 0 && (
        <>
          <div className="mt-6 flex items-center justify-between gap-3">
            <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-faint">
              Thứ tự xuất {loading && <span className="normal-case tracking-normal text-muted">· đang đọc file…</span>}
            </p>
            <button
              type="button"
              onClick={() => extraInput.current?.click()}
              className="btn-ghost -mr-2"
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
            <AnimatePresence initial={false}>
              {rows.map((row) => (
                <PdfRowItem
                  key={row.id}
                  row={row}
                  dragging={dragging === row.id}
                  onUpdate={updateRow}
                  onDuplicate={(id) => {
                    duplicateRow(id)
                    announce('Đã nhân bản đoạn.')
                  }}
                  onRemove={(id) => {
                    removeRow(id)
                    announce('Đã xóa dòng.')
                  }}
                  onMove={(id, direction) => {
                    moveRow(id, direction)
                    announce(direction < 0 ? 'Đã đưa lên.' : 'Đã đưa xuống.')
                  }}
                  onDragStart={setDragging}
                  onDrop={(source, target) => {
                    reorderRow(source, target)
                    announce('Đã đổi thứ tự.')
                  }}
                />
              ))}
            </AnimatePresence>
            {loading && (
              <li aria-hidden="true" className="space-y-2 border-b border-line py-4">
                <div className="h-3 w-2/5 animate-pulse rounded bg-surface-hover" />
                <div className="h-3 w-1/4 animate-pulse rounded bg-surface-hover" />
              </li>
            )}
          </ul>

          <StickyActionBar
            busy={status === 'running'}
            disabled={invalid || tooMany}
            label="Xuất PDF"
            onAction={handleExport}
            secondary={{ label: 'Xem trước', onClick: handlePreview }}
            summary={
              <>
                Tổng: <span className="font-semibold text-text">{total}</span> trang từ{' '}
                <span className="font-semibold text-text">{sourceCount}</span> file
              </>
            }
            extra={
              tooMany ? (
                <p className="text-[11px] text-danger md:absolute md:-top-5 md:right-0">
                  Tối đa {LIMITS.maxOutputPages} trang mỗi lần xuất.
                </p>
              ) : undefined
            }
          />
        </>
      )}

      <PdfPreviewModal
        open={previewOpen}
        bytes={previewBytes}
        title="Xem trước bản gộp"
        onClose={() => setPreviewOpen(false)}
        onDownload={() => {
          if (previewBytes) downloadBytes(previewBytes, 'ket-qua.pdf')
          setPreviewOpen(false)
        }}
      />

      <StatusLine message={message} status={status} />
    </section>
  )
}
