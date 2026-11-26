import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { useAsyncTask } from '../hooks/useAsyncTask'
import type { ExportRef } from '../hooks/useExportShortcut'
import { usePdfRows } from '../hooks/usePdfRows'
import { downloadBytes } from '../lib/download'
import { LIMITS } from '../lib/errors'
import { applyPresetToRows, outputName, type PagePreset } from '../lib/exportOptions'
import { mergeRows } from '../lib/pdf'
import { rangeIssue, totalPages } from '../lib/parse'
import type { IncomingFiles } from '../types'
import { Dropzone } from './Dropzone'
import { ExportOptions } from './ExportOptions'
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
  const [filename, setFilename] = useState('')
  const [preset, setPreset] = useState<PagePreset>('all')
  const [interleave, setInterleave] = useState(false)
  const [reverseSecond, setReverseSecond] = useState(false)
  const extraInput = useRef<HTMLInputElement>(null)
  const lastToken = useRef(0)
  const outputCache = useRef<{ key: string; bytes: Uint8Array } | null>(null)

  useEffect(() => {
    if (incoming.target === 'pdf' && incoming.token > lastToken.current && incoming.files.length) {
      lastToken.current = incoming.token
      void run(() => addFiles(incoming.files), `Đã thêm ${incoming.files.length} file.`)
    }
  }, [incoming, addFiles, run])

  const invalid = rows.some((row) => rangeIssue(row.from, row.to, row.pageCount) !== null)
  const outputRows = useMemo(() => applyPresetToRows(rows, preset), [rows, preset])
  const total = totalPages(outputRows)
  const sourceCount = new Set(rows.map((row) => row.fileId)).size
  const tooMany = total > LIMITS.maxOutputPages
  const canInterleave = rows.length === 2
  const useInterleave = canInterleave && interleave
  const signature = `${outputRows.map((row) => `${row.id}@${row.from}-${row.to}`).join('|')}#i:${useInterleave ? 1 : 0}:r:${useInterleave && reverseSecond ? 1 : 0}`
  const name = outputName(filename, 'ket-qua')

  const buildOutput = useCallback(async () => {
    if (outputCache.current?.key === signature) return outputCache.current.bytes
    const bytes = await mergeRows(outputRows, getCache(), useInterleave ? { interleave: true, reverseSecond } : undefined)
    outputCache.current = { key: signature, bytes }
    return bytes
  }, [getCache, outputRows, reverseSecond, signature, useInterleave])

  const validate = useCallback(() => {
    if (!rows.length) throw new Error('Hãy kéo ít nhất một file PDF.')
    if (invalid) throw new Error('Hãy sửa các khoảng trang trước khi xuất.')
    if (tooMany) throw new Error(`Tối đa ${LIMITS.maxOutputPages} trang mỗi lần xuất.`)
  }, [invalid, rows.length, tooMany])

  const handleExport = useCallback(() => {
    void run(async () => {
      validate()
      const bytes = await buildOutput()
      downloadBytes(bytes, name)
    }, `Đã xuất ${total} trang.`)
  }, [buildOutput, name, run, total, validate])

  const handlePreview = useCallback(() => {
    void run(async () => {
      validate()
      const bytes = await buildOutput()
      setPreviewBytes(bytes)
      setPreviewOpen(true)
    }, 'Đã dựng xong bản xem trước.')
  }, [buildOutput, run, validate])

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

          {canInterleave && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={interleave}
                onClick={() => setInterleave((prev) => !prev)}
                className={`min-h-11 rounded-control border px-3 text-[12px] transition-colors duration-150 ${
                  interleave
                    ? 'border-accent bg-accent-soft font-semibold text-accent'
                    : 'border-line bg-surface text-muted hover:border-line-strong hover:text-text'
                }`}
              >
                {interleave ? '✓ Đang bật: ' : ''}Ghép xen kẽ 2 mặt (A1, B1, A2, B2…)
              </button>
              {interleave && (
                <button
                  type="button"
                  aria-pressed={reverseSecond}
                  onClick={() => setReverseSecond((prev) => !prev)}
                  className={`min-h-11 rounded-control border px-3 text-[12px] transition-colors duration-150 ${
                    reverseSecond
                      ? 'border-accent bg-accent-soft font-semibold text-accent'
                      : 'border-line bg-surface text-muted hover:border-line-strong hover:text-text'
                  }`}
                >
                  {reverseSecond ? '✓ Đảo ngược thứ tự file 2' : 'Đảo ngược thứ tự file 2'}
                </button>
              )}
            </div>
          )}

          <ExportOptions filename={filename} onFilename={setFilename} preset={preset} onPreset={setPreset} />

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
          if (previewBytes) downloadBytes(previewBytes, name)
          setPreviewOpen(false)
        }}
      />

      <StatusLine message={message} status={status} />
    </section>
  )
}
