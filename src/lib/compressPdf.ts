import { loadPdfjs } from './pdfjs'

export type CompressLevel = 'light' | 'balanced' | 'aggressive' | 'extreme'

export type RasterSettings = {
  scale: number
  quality: number
}

export type CompressPdfResult = {
  bytes: Uint8Array
  originalBytes: number
  finalBytes: number
  pageCount: number
  reachedTarget: boolean
  rasterized: boolean
  atFloor: boolean
}

export type SplitSizeResult =
  | { kind: 'pdf'; bytes: Uint8Array; filename: string; count: 1; sizes: number[] }
  | { kind: 'zip'; bytes: Uint8Array; filename: string; count: number; sizes: number[] }

const LEVEL_PRESETS: Record<CompressLevel, RasterSettings> = {
  light: { scale: 2.0, quality: 0.85 },
  balanced: { scale: 1.5, quality: 0.68 },
  aggressive: { scale: 1.2, quality: 0.48 },
  extreme: { scale: 0.95, quality: 0.32 },
}

const RASTER_START: RasterSettings = { scale: 1.9, quality: 0.65 }
const MIN_SCALE = 0.9
const MIN_QUALITY = 0.25
const SAFETY = 0.9
const MAX_RASTER_ATTEMPTS = 6

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1000) return `${Math.round(kb)} KB`
  const mb = bytes / 1_000_000
  return `${Number(mb.toFixed(mb < 10 ? 2 : 1))} MB`
}

/**
 * Tính cặp scale/quality kế tiếp dựa trên tỉ lệ dung lượng thực tế so với mục tiêu
 * (tham chiếu thuật toán compress-target của cit-pdf).
 */
export function nextRasterSettings(
  current: RasterSettings,
  actualBytes: number,
  targetBytes: number,
): RasterSettings | null {
  if (current.scale <= MIN_SCALE && current.quality <= MIN_QUALITY) return null

  const ratio = Math.min((targetBytes * SAFETY) / Math.max(1, actualBytes), 0.95)
  const scale = current.scale * Math.sqrt(ratio)
  if (scale >= MIN_SCALE) {
    return { scale, quality: Math.max(MIN_QUALITY, current.quality - 0.05) }
  }

  const reachedByScale = (MIN_SCALE / current.scale) ** 2
  const quality = current.quality * Math.min(ratio / reachedByScale, 0.8)
  return { scale: MIN_SCALE, quality: Math.max(MIN_QUALITY, quality) }
}

function applyGrayscaleToCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data
  for (let i = 0; i < data.length; i += 4) {
    const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
    data[i] = lum
    data[i + 1] = lum
    data[i + 2] = lum
  }
  ctx.putImageData(imageData, 0, 0)
}

async function renderCompressedPdf(
  pdfBytes: Uint8Array,
  settings: RasterSettings,
  options: { grayscale: boolean; onProgress?: (label: string) => void },
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const [{ PDFDocument }, pdfjs] = await Promise.all([import('pdf-lib'), loadPdfjs()])
  const loadingTask = pdfjs.getDocument({ data: pdfBytes.slice() })
  const doc = await loadingTask.promise
  const out = await PDFDocument.create()
  const canvas = document.createElement('canvas')

  try {
    const total = doc.numPages
    for (let i = 1; i <= total; i += 1) {
      options.onProgress?.(`Đang nén trang ${i} / ${total}…`)
      const page = await doc.getPage(i)
      const baseViewport = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: settings.scale })
      canvas.width = Math.max(1, Math.ceil(viewport.width))
      canvas.height = Math.max(1, Math.ceil(viewport.height))
      const ctx = canvas.getContext('2d', { willReadFrequently: options.grayscale })
      if (!ctx) throw new Error('Không thể khởi tạo canvas để nén trang.')

      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvas, canvasContext: ctx, viewport }).promise

      if (options.grayscale) {
        applyGrayscaleToCanvas(canvas, ctx)
      }

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (result) => (result ? resolve(result) : reject(new Error(`Không thể nén ảnh trang ${i}.`))),
          'image/jpeg',
          settings.quality,
        )
      })
      const jpgImage = await out.embedJpg(await blob.arrayBuffer())
      const outPage = out.addPage([baseViewport.width, baseViewport.height])
      outPage.drawImage(jpgImage, {
        x: 0,
        y: 0,
        width: baseViewport.width,
        height: baseViewport.height,
      })
    }

    const bytes = await out.save({ useObjectStreams: true })
    return { bytes, pageCount: total }
  } finally {
    canvas.width = 0
    canvas.height = 0
    await loadingTask.destroy()
  }
}

async function optimizeStructureLossless(pdfBytes: Uint8Array): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const { PDFDocument } = await import('pdf-lib')
  const source = await PDFDocument.load(pdfBytes, { throwOnInvalidObject: false })
  const pageCount = source.getPageCount()
  const output = await PDFDocument.create()
  const copied = await output.copyPages(source, source.getPageIndices())
  copied.forEach((page) => output.addPage(page))
  const bytes = await output.save({ useObjectStreams: true })
  return { bytes, pageCount }
}

/**
 * Nén PDF thuần trình duyệt: thử tối ưu cấu trúc giữ lớp chữ trước;
 * nếu cần giảm sâu hoặc khớp giới hạn MB thì chuyển sang nén thích ứng từng trang.
 */
export async function compressPdf(
  pdfBytes: Uint8Array,
  options: {
    level: CompressLevel
    targetBytes: number | null
    grayscale: boolean
    onProgress?: (label: string) => void
  },
): Promise<CompressPdfResult> {
  const originalBytes = pdfBytes.byteLength
  options.onProgress?.('Đang tối ưu cấu trúc PDF…')

  const lossless = await optimizeStructureLossless(pdfBytes)
  const pageCount = lossless.pageCount

  if (options.targetBytes !== null && !options.grayscale && lossless.bytes.byteLength <= options.targetBytes) {
    return {
      bytes: lossless.bytes,
      originalBytes,
      finalBytes: lossless.bytes.byteLength,
      pageCount,
      reachedTarget: true,
      rasterized: false,
      atFloor: false,
    }
  }

  let bestBytes = lossless.bytes
  let rasterized = false
  let atFloor = false

  if (options.targetBytes === null) {
    const preset = LEVEL_PRESETS[options.level]
    const rendered = await renderCompressedPdf(pdfBytes, preset, {
      grayscale: options.grayscale,
      onProgress: options.onProgress,
    })
    if (options.grayscale || rendered.bytes.byteLength < bestBytes.byteLength) {
      bestBytes = rendered.bytes
      rasterized = true
    }
    return {
      bytes: bestBytes,
      originalBytes,
      finalBytes: bestBytes.byteLength,
      pageCount,
      reachedTarget: true,
      rasterized,
      atFloor: false,
    }
  }

  let settings: RasterSettings | null = RASTER_START
  for (let attempt = 0; settings && attempt < MAX_RASTER_ATTEMPTS; attempt += 1) {
    const labelPrefix = attempt === 0 ? 'Đang nén vừa giới hạn' : `Đang tinh chỉnh lần ${attempt + 1}`
    const rendered = await renderCompressedPdf(pdfBytes, settings, {
      grayscale: options.grayscale,
      onProgress: (text) => options.onProgress?.(`${labelPrefix} — ${text}`),
    })

    if (options.grayscale && !rasterized) {
      bestBytes = rendered.bytes
      rasterized = true
    } else if (rendered.bytes.byteLength < bestBytes.byteLength) {
      bestBytes = rendered.bytes
      rasterized = true
    }

    if (rendered.bytes.byteLength <= options.targetBytes) {
      break
    }

    settings = nextRasterSettings(settings, rendered.bytes.byteLength, options.targetBytes)
    if (!settings) atFloor = true
  }

  return {
    bytes: bestBytes,
    originalBytes,
    finalBytes: bestBytes.byteLength,
    pageCount,
    reachedTarget: bestBytes.byteLength <= options.targetBytes,
    rasterized,
    atFloor,
  }
}

/**
 * Chia PDF thành ít phần liên tiếp nhất sao cho mỗi phần <= limitBytes
 * bằng exponential grow + binary search (tham chiếu splitUnderLimit của cit-pdf).
 * Trả về null nếu có trang đơn đã vượt limitBytes.
 */
export async function splitPdfUnderSizeLimit(
  pdfBytes: Uint8Array,
  limitBytes: number,
  baseStem: string,
  onProgress?: (label: string) => void,
): Promise<SplitSizeResult | null> {
  const { PDFDocument } = await import('pdf-lib')
  const source = await PDFDocument.load(pdfBytes, { throwOnInvalidObject: false })
  const total = source.getPageCount()
  const safeStem = baseStem.replace(/[\\/:*?"<>|]/g, '').trim() || 'tach-pdf'
  const mbVal = limitBytes / 1_000_000
  const mbLabel = String(Number(mbVal.toFixed(1))).replace('.', '_')

  const buildSlice = async (fromIdx: number, toIdx: number): Promise<Uint8Array> => {
    const part = await PDFDocument.create()
    const indices = Array.from({ length: toIdx - fromIdx }, (_, i) => fromIdx + i)
    const copied = await part.copyPages(source, indices)
    copied.forEach((page) => part.addPage(page))
    return part.save({ useObjectStreams: true })
  }

  const parts: Array<{ bytes: Uint8Array; fromPage: number; toPage: number }> = []
  let start = 0
  while (start < total) {
    onProgress?.(`Đang cân dung lượng từ trang ${start + 1} / ${total}…`)
    let good = start
    let goodBytes: Uint8Array | null = null
    let step = Math.max(1, Math.round((total * limitBytes) / Math.max(1, pdfBytes.byteLength) / 2))
    let bad = total + 1

    while (good + 1 < bad) {
      const end = Math.min(bad - 1, good + step, total)
      const candidate = await buildSlice(start, end)
      if (candidate.byteLength <= limitBytes) {
        good = end
        goodBytes = candidate
        if (end === total) break
        step *= 2
      } else {
        bad = end
        step = Math.max(1, Math.floor((bad - good) / 2))
      }
    }

    if (!goodBytes) return null
    parts.push({ bytes: goodBytes, fromPage: start + 1, toPage: good })
    start = good
  }

  if (parts.length === 1) {
    return {
      kind: 'pdf',
      bytes: parts[0].bytes,
      filename: `${safeStem}.pdf`,
      count: 1,
      sizes: [parts[0].bytes.byteLength],
    }
  }

  const { zipSync } = await import('fflate')
  const entries: Record<string, Uint8Array> = {}
  parts.forEach((part, index) => {
    const pad = String(index + 1).padStart(2, '0')
    const suffix = part.fromPage === part.toPage ? `tr${part.fromPage}` : `tr${part.fromPage}-${part.toPage}`
    entries[`${safeStem}-phan-${pad}-${suffix}.pdf`] = part.bytes
  })

  return {
    kind: 'zip',
    bytes: zipSync(entries, { level: 0 }),
    filename: `${safeStem}-duoi-${mbLabel}mb.zip`,
    count: parts.length,
    sizes: parts.map((p) => p.bytes.byteLength),
  }
}
