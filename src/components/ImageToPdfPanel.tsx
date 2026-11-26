import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAsyncTask } from '../hooks/useAsyncTask'
import type { ExportRef } from '../hooks/useExportShortcut'
import { downloadBytes } from '../lib/download'
import { isImageFile, LIMITS, sizeError } from '../lib/errors'
import { filterPages, outputName, type PagePreset } from '../lib/exportOptions'
import { imagesToPdf, readImage, type ImageItem, type ImagePdfQuality } from '../lib/imageToPdf'
import type { IncomingFiles } from '../types'
import { Dropzone } from './Dropzone'
import { ExportOptions } from './ExportOptions'
import { PdfPreviewModal } from './PdfPreviewModal'
import { StickyActionBar } from './StickyActionBar'
import { StatusLine } from './StatusLine'

type Props = {
  incoming: IncomingFiles
  onFiles: (files: File[]) => void
  active: boolean
  exportRef: ExportRef
}

export function ImageToPdfPanel({ incoming, onFiles, active, exportRef }: Props) {
  const [items, setItems] = useState<ImageItem[]>([])
  const objectUrls = useRef<Set<string>>(new Set())
  const [filename, setFilename] = useState('')
  const [preset, setPreset] = useState<PagePreset>('all')
  const [quality, setQuality] = useState<ImagePdfQuality>('original')
  const [previewBytes, setPreviewBytes] = useState<Uint8Array | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const lastToken = useRef(0)
  const outputCache = useRef<{ key: string; bytes: Uint8Array } | null>(null)
  const { status, message, run } = useAsyncTask()

  const acceptFiles = useCallback(async (files: File[]) => {
    const images = files.filter(isImageFile)
    if (!images.length) throw new Error('Chỉ hỗ trợ ảnh JPG và PNG.')
    if (images.length > LIMITS.maxFilesPerDrop) throw new Error(`Tối đa ${LIMITS.maxFilesPerDrop} ảnh mỗi lần.`)
    const oversized = images.find((image) => image.size > LIMITS.maxFileBytes)
    if (oversized) throw new Error(sizeError(oversized))
    if (items.length + images.length > LIMITS.maxOutputPages) {
      throw new Error(`Tối đa ${LIMITS.maxOutputPages} ảnh mỗi lần.`)
    }
    const prepared = await Promise.all(images.map(readImage))
    prepared.forEach((item) => objectUrls.current.add(item.url))
    setItems((previous) => [...previous, ...prepared])
  }, [items.length])

  useEffect(() => {
    if (incoming.target === 'image' && incoming.token > lastToken.current && incoming.files.length) {
      lastToken.current = incoming.token
      void run(() => acceptFiles(incoming.files), `Đã thêm ${incoming.files.length} ảnh.`)
    }
  }, [incoming, acceptFiles, run])

  useEffect(
    () => () => {
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url))
    },
    [],
  )

  const release = (item: ImageItem) => {
    URL.revokeObjectURL(item.url)
    objectUrls.current.delete(item.url)
  }

  const selected = useMemo(
    () => filterPages(items.map((_, index) => index + 1), preset).map((page) => items[page - 1]),
    [items, preset],
  )
  const signature = `${quality}:${selected.map((item) => item.id).join('|')}`
  const name = outputName(filename, 'hinh-anh')

  const buildOutput = useCallback(async () => {
    if (outputCache.current?.key === signature) return outputCache.current.bytes
    const bytes = await imagesToPdf(selected, quality)
    outputCache.current = { key: signature, bytes }
    return bytes
  }, [quality, selected, signature])

  const handleExport = useCallback(() => {
    void run(async () => {
      if (!items.length) throw new Error('Hãy kéo ít nhất một ảnh.')
      downloadBytes(await buildOutput(), name)
    }, `Đã tạo PDF từ ${selected.length} ảnh.`)
  }, [buildOutput, items.length, name, run, selected.length])

  const handlePreview = useCallback(() => {
    void run(async () => {
      if (!items.length) throw new Error('Hãy kéo ít nhất một ảnh.')
      setPreviewBytes(await buildOutput())
      setPreviewOpen(true)
    }, 'Đã dựng xong bản xem trước.')
  }, [buildOutput, items.length, run])

  useEffect(() => {
    if (!active) return
    exportRef.current = handleExport
    return () => {
      if (exportRef.current === handleExport) exportRef.current = null
    }
  }, [active, exportRef, handleExport])

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= items.length) return
    setItems((previous) => {
      const next = [...previous]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  return (
    <section>
      <h2 className="sr-only">Ảnh sang PDF</h2>

      <Dropzone
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        multiple
        title="Kéo ảnh JPG / PNG / WebP vào đây"
        hint="hoặc bấm để chọn · mỗi ảnh thành một trang A4"
        onFiles={onFiles}
        busy={status === 'running'}
      />

      {items.length > 0 && (
        <>
          <div className="mt-6 flex items-center justify-between gap-3">
            <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Thứ tự trang</p>
            <button
              type="button"
              onClick={() => {
                items.forEach(release)
                setItems([])
                setPreviewBytes(null)
                outputCache.current = null
              }}
              className="btn-ghost -mr-2"
            >
              Xóa tất cả
            </button>
          </div>

          <ul className="mt-1">
            {items.map((item, index) => (
              <li key={item.id} className="flex items-center gap-3 border-b border-line py-3">
                <img
                  src={item.url}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded bg-bg object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-text" title={item.file.name}>
                    {item.file.name}
                  </p>
                  <p className="mt-0.5 text-[11px] tabular text-muted">
                    Trang {index + 1} · {item.width}×{item.height}
                  </p>
                </div>
                <div className="flex shrink-0 items-center">
                  <button
                    type="button"
                    aria-label="Đưa lên"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    className="btn-ghost h-11 w-11 justify-center"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label="Đưa xuống"
                    disabled={index === items.length - 1}
                    onClick={() => move(index, 1)}
                    className="btn-ghost h-11 w-11 justify-center"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label="Xóa ảnh"
                    onClick={() => {
                      release(item)
                      setItems((previous) => previous.filter((entry) => entry.id !== item.id))
                      outputCache.current = null
                    }}
                    className="btn-ghost h-11 w-11 justify-center text-danger"
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-5 border-t border-line pt-4">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Chất lượng &amp; dung lượng</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Chất lượng ảnh">
              {(
                [
                  { value: 'original', label: 'Giữ nguyên gốc' },
                  { value: 'balanced', label: 'Cân bằng · nhẹ hơn' },
                  { value: 'compact', label: 'Siêu nhẹ · gửi Zalo' },
                ] as const
              ).map((option) => {
                const selectedOpt = quality === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selectedOpt}
                    onClick={() => setQuality(option.value)}
                    className={`min-h-11 rounded-control border px-3 text-[12px] transition-colors duration-150 ${
                      selectedOpt
                        ? 'border-accent bg-accent-soft font-semibold text-accent'
                        : 'border-line bg-surface text-muted hover:border-line-strong hover:text-text'
                    }`}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>

          <ExportOptions filename={filename} onFilename={setFilename} preset={preset} onPreset={setPreset} />

          <StickyActionBar
            busy={status === 'running'}
            disabled={selected.length === 0}
            label="Tạo PDF"
            onAction={handleExport}
            secondary={{ label: 'Xem trước', onClick: handlePreview }}
            summary={
              <>
                <span className="font-semibold text-text">{selected.length}</span> / {items.length} ảnh · mỗi ảnh 1
                trang A4
              </>
            }
          />
        </>
      )}

      <PdfPreviewModal
        open={previewOpen}
        bytes={previewBytes}
        title="Xem trước PDF từ ảnh"
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
