import { loadPdfjs } from './pdfjs'

export type ImageFormat = 'jpeg' | 'png'
export type ImageQualityScale = 1.5 | 2 | 3

export type RenderedPageImage = {
  pageNumber: number
  filename: string
  mimeType: string
  bytes: Uint8Array
  url: string
}

export async function renderPdfPagesToImages(
  pdfBytes: Uint8Array,
  pages: number[],
  options: {
    format: ImageFormat
    scale: ImageQualityScale
    baseStem: string
    onProgress?: (done: number, total: number) => void
  },
): Promise<RenderedPageImage[]> {
  if (!pages.length) throw new Error('Không có trang nào để chuyển sang ảnh.')

  const pdfjs = await loadPdfjs()
  const loadingTask = pdfjs.getDocument({ data: pdfBytes.slice() })
  const documentProxy = await loadingTask.promise
  const safeStem = options.baseStem.replace(/[\\/:*?"<>|]/g, '').trim() || 'trang'
  const mimeType = options.format === 'png' ? 'image/png' : 'image/jpeg'
  const ext = options.format === 'png' ? 'png' : 'jpg'
  const results: RenderedPageImage[] = []

  try {
    const canvas = document.createElement('canvas')
    for (let index = 0; index < pages.length; index += 1) {
      const pageNumber = pages[index]
      options.onProgress?.(index + 1, pages.length)
      const page = await documentProxy.getPage(pageNumber)
      const viewport = page.getViewport({ scale: options.scale })
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Không thể khởi tạo bộ vẽ ảnh.')

      if (options.format === 'jpeg') {
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, canvas.width, canvas.height)
      } else {
        context.clearRect(0, 0, canvas.width, canvas.height)
      }

      await page.render({ canvas, canvasContext: context, viewport }).promise
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (result) => (result ? resolve(result) : reject(new Error(`Không thể xuất ảnh trang ${pageNumber}.`))),
          mimeType,
          options.format === 'jpeg' ? 0.92 : undefined,
        )
      })
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const pad = String(pageNumber).padStart(String(documentProxy.numPages).length, '0')
      results.push({
        pageNumber,
        filename: `${safeStem}-trang-${pad}.${ext}`,
        mimeType,
        bytes,
        url: URL.createObjectURL(blob),
      })
    }
    canvas.width = 0
    canvas.height = 0
    return results
  } finally {
    await loadingTask.destroy()
  }
}

export async function packImagesToZip(images: RenderedPageImage[]): Promise<Uint8Array> {
  const { zipSync } = await import('fflate')
  const entries: Record<string, Uint8Array> = {}
  for (const image of images) {
    entries[image.filename] = image.bytes
  }
  return zipSync(entries, { level: 0 })
}
