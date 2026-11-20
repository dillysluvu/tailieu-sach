import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { friendlyError } from '../lib/errors'
import { loadPdfjs } from '../lib/pdfjs'
import { Modal } from './Modal'

const PAGE_BATCH = 20

type PageCanvasProps = {
  document: PDFDocumentProxy
  pageNumber: number
  root: HTMLDivElement | null
  width: number
}

/** Renders only while on screen; canvas memory is released when scrolled away. */
function PageCanvas({ document, pageNumber, root, width }: PageCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const taskRef = useRef<RenderTask | null>(null)
  const status = useRef<'idle' | 'loading' | 'done'>('idle')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const wrapper = wrapperRef.current
    if (!canvas || !wrapper || !root) return
    let active = true

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((entry) => entry.isIntersecting)
        if (visible && status.current === 'idle') {
          status.current = 'loading'
          setBusy(true)
          setFailed(false)
          void (async () => {
            try {
              const page = await document.getPage(pageNumber)
              if (!active) return
              const base = page.getViewport({ scale: 1 })
              const viewport = page.getViewport({ scale: Math.min(1.4, width / base.width) })
              canvas.width = Math.ceil(viewport.width)
              canvas.height = Math.ceil(viewport.height)
              const context = canvas.getContext('2d')
              if (!context) throw new Error('Không thể tạo canvas để xem trước.')
              taskRef.current = page.render({ canvas, canvasContext: context, viewport })
              await taskRef.current.promise
              if (active) status.current = 'done'
            } catch (error) {
              if (!active || (error as { name?: string })?.name === 'RenderingCancelledException') return
              status.current = 'idle'
              setFailed(true)
            } finally {
              if (active) setBusy(false)
            }
          })()
        } else if (!visible && status.current !== 'idle') {
          taskRef.current?.cancel()
          taskRef.current = null
          status.current = 'idle'
          canvas.width = 0
          canvas.height = 0
        }
      },
      { root, rootMargin: '200px 0px', threshold: 0.01 },
    )

    observer.observe(wrapper)
    return () => {
      active = false
      observer.disconnect()
      taskRef.current?.cancel()
      canvas.width = 0
      canvas.height = 0
    }
  }, [document, pageNumber, root, width])

  return (
    <div
      ref={wrapperRef}
      data-page={pageNumber}
      className="relative flex min-h-40 justify-center rounded-card border border-line bg-bg p-2"
    >
      <canvas ref={canvasRef} className="block h-auto max-w-full" aria-label={`Trang ${pageNumber}`} />
      {(busy || failed) && (
        <span className="absolute inset-0 flex items-center justify-center text-[11px] text-muted">
          {failed ? 'Không hiển thị được trang này' : 'Đang tải trang…'}
        </span>
      )}
    </div>
  )
}

type Props = {
  open: boolean
  bytes: Uint8Array | null
  title?: string
  onClose: () => void
  onDownload?: () => void
}

export function PdfPreviewModal({ open, bytes, title = 'Xem trước PDF', onClose, onDownload }: Props) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null)
  const [current, setCurrent] = useState(1)
  const [limit, setLimit] = useState(PAGE_BATCH)
  const [error, setError] = useState('')
  const total = document?.numPages ?? 0
  const width = Math.min(760, Math.max(280, (root?.clientWidth ?? 800) - 48))

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
        setCurrent(1)
        setLimit(Math.min(PAGE_BATCH, loaded.numPages))
        setError('')
      } catch (cause) {
        if (!cancelled) setError(friendlyError(cause))
      }
    })()

    return () => {
      cancelled = true
      void loadingTask?.destroy()
      setDocument(null)
    }
  }, [open, bytes])

  useEffect(() => {
    if (!root || !sentinelRef.current || limit >= total) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setLimit((value) => Math.min(total, value + PAGE_BATCH))
        }
      },
      { root, rootMargin: '300px 0px' },
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [root, limit, total])

  const goTo = (page: number) => {
    if (!root || page < 1 || page > total) return
    const target = root.querySelector<HTMLElement>(`[data-page="${page}"]`)
    target?.scrollIntoView({ block: 'start' })
    setCurrent(page)
  }

  const pages = Array.from({ length: Math.min(limit, total) }, (_, index) => index + 1)

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
              onClick={() => goTo(current - 1)}
              disabled={current <= 1}
              className="btn-ghost border border-line"
              aria-label="Trang trước"
            >
              ←
            </button>
            <span className="text-xs tabular text-muted">
              {current} / {total || '…'}
            </span>
            <button
              type="button"
              onClick={() => goTo(current + 1)}
              disabled={current >= total}
              className="btn-ghost border border-line"
              aria-label="Trang sau"
            >
              →
            </button>
          </div>
          <div
            ref={setRoot}
            onScroll={(event) => {
              const container = event.currentTarget
              const first = container.querySelector<HTMLElement>('[data-page]')
              const step = Math.max(1, (first?.offsetHeight ?? 0) + 12)
              setCurrent(Math.min(total, Math.max(1, Math.round(container.scrollTop / step) + 1)))
            }}
            className="h-[58dvh] space-y-3 overflow-auto rounded-card border border-line bg-surface/40 p-3"
          >
            {pages.map((page) => (
              <PageCanvas key={page} document={document!} pageNumber={page} root={root} width={width} />
            ))}
            <div ref={sentinelRef} aria-hidden="true" className="h-1" />
          </div>
        </div>
      )}
    </Modal>
  )
}
