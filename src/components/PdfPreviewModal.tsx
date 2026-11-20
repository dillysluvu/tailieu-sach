import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { friendlyError } from '../lib/errors'
import { loadPdfjs } from '../lib/pdfjs'
import { Modal } from './Modal'

type Props = {
  open: boolean
  bytes: Uint8Array | null
  title?: string
  onClose: () => void
  onDownload?: () => void
}

export function PdfPreviewModal({ open, bytes, title = 'Xem trước PDF', onClose, onDownload }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderTask = useRef<RenderTask | null>(null)
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null)
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const total = document?.numPages ?? 0

  useEffect(() => {
    if (!open || !bytes) return
    let cancelled = false
    let loadingTask: PDFDocumentLoadingTask | null = null

    void (async () => {
      try {
        const pdfjs = await loadPdfjs()
        loadingTask = pdfjs.getDocument({ data: bytes.slice() })
        const loaded = await loadingTask.promise
        if (cancelled) {
          await loadingTask.destroy()
          return
        }
        setDocument(loaded)
        setPage(1)
        setError('')
      } catch (cause) {
        if (!cancelled) setError(friendlyError(cause))
      }
    })()

    return () => {
      cancelled = true
      renderTask.current?.cancel()
      void loadingTask?.destroy()
      setDocument(null)
    }
  }, [open, bytes])

  useEffect(() => {
    if (!open || !document || !canvasRef.current) return
    let cancelled = false

    void (async () => {
      try {
        renderTask.current?.cancel()
        const pdfPage = await document.getPage(page)
        const canvas = canvasRef.current
        if (!canvas || cancelled) return
        const base = pdfPage.getViewport({ scale: 1 })
        const maxWidth = Math.min((typeof window === 'undefined' ? 800 : window.innerWidth) - 48, 760)
        const viewport = pdfPage.getViewport({ scale: Math.max(0.2, maxWidth / base.width) })
        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Không thể tạo canvas để xem trước.')
        renderTask.current = pdfPage.render({ canvas, canvasContext: context, viewport })
        await renderTask.current.promise
      } catch (cause) {
        if (!cancelled) setError(friendlyError(cause))
      }
    })()

    return () => {
      cancelled = true
      renderTask.current?.cancel()
    }
  }, [open, document, page])

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-ghost">
            Đóng
          </button>
          {onDownload && (
            <button type="button" onClick={onDownload} className="btn-primary">
              Tải xuống
            </button>
          )}
        </>
      }
    >
      {error ? (
        <p className="rounded-card border border-line bg-bg px-3 py-2 text-xs text-danger">{error}</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={page <= 1}
              className="btn-ghost border border-line"
              aria-label="Trang trước"
            >
              ←
            </button>
            <span className="text-xs tabular text-muted">
              {page} / {total || '…'}
            </span>
            <button
              type="button"
              onClick={() => setPage((value) => Math.min(total, value + 1))}
              disabled={page >= total}
              className="btn-ghost border border-line"
              aria-label="Trang sau"
            >
              →
            </button>
          </div>
          <div className="mx-auto flex min-h-40 justify-center overflow-auto rounded-card border border-line bg-bg p-2">
            <canvas ref={canvasRef} className="block h-auto max-w-full" aria-label={`Trang ${page}`} />
          </div>
        </div>
      )}
    </Modal>
  )
}
