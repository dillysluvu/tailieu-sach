import { loadPdfjs } from './pdfjs'

export type PageNumberPosition =
  | 'bottom-center'
  | 'bottom-left'
  | 'bottom-right'
  | 'top-center'
  | 'top-left'
  | 'top-right'

export type PageNumberFormat = 'number' | 'x-of-y' | 'trang-x-of-y'

export type BlankPageMatch = {
  pageNumber: number
  nonWhitePercent: number
  thumbnailUrl: string
}

export type OrganizePageSpec =
  | { kind: 'source'; id: string; sourceIndex: number; rotation: 0 | 90 | 180 | 270 }
  | { kind: 'blank'; id: string }

export type PdfMetadataInfo = {
  title: string
  author: string
  subject: string
  creator: string
  producer: string
  keywords: string
}

const A4_PORTRAIT: [number, number] = [595.28, 841.89]
const A4_LANDSCAPE: [number, number] = [841.89, 595.28]
const MAX_TILES = 1500
const DEFAULT_TILE_GAP_X = 0.25
const DEFAULT_TILE_GAP_Y = 0.75

function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '')
  const normalized =
    clean.length === 3
      ? clean
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : clean
  const intVal = Number.parseInt(normalized, 16)
  if (Number.isNaN(intVal)) return { r: 0.45, g: 0.45, b: 0.48 }
  return {
    r: ((intVal >> 16) & 255) / 255,
    g: ((intVal >> 8) & 255) / 255,
    b: (intVal & 255) / 255,
  }
}

/** Xoay cộng dồn góc 90°/180°/270° cho toàn bộ hoặc danh sách trang chọn (giữ nguyên 100% vector). */
export async function rotatePdf(
  pdfBytes: Uint8Array,
  angle: 90 | 180 | 270,
  targetPages?: number[],
): Promise<Uint8Array> {
  const { PDFDocument, degrees } = await import('pdf-lib')
  const doc = await PDFDocument.load(pdfBytes, { throwOnInvalidObject: false })
  const pages = doc.getPages()
  const targetSet = targetPages?.length ? new Set(targetPages) : null

  pages.forEach((page, index) => {
    if (targetSet && !targetSet.has(index + 1)) return
    const current = page.getRotation().angle
    page.setRotation(degrees((current + angle) % 360))
  })

  return doc.save()
}

/** Đánh số trang chuẩn vector (Helvetica không dấu, tương thích 100% chữ `Trang 1 / 12`). */
export async function addPageNumbersToPdf(
  pdfBytes: Uint8Array,
  options: {
    position: PageNumberPosition
    format: PageNumberFormat
    fontSize: number
    startNumber: number
  },
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.load(pdfBytes, { throwOnInvalidObject: false })
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const pages = doc.getPages()
  const totalPages = pages.length
  const startOffset = Math.max(1, Math.floor(options.startNumber)) - 1
  const displayTotal = totalPages + startOffset

  for (let i = 0; i < totalPages; i += 1) {
    const page = pages[i]
    const bounds = page.getCropBox() || page.getMediaBox()
    const width = bounds.width
    const height = bounds.height
    const xOffset = bounds.x || 0
    const yOffset = bounds.y || 0
    const num = i + 1 + startOffset

    const text =
      options.format === 'trang-x-of-y'
        ? `Trang ${num} / ${displayTotal}`
        : options.format === 'x-of-y'
          ? `${num} / ${displayTotal}`
          : `${num}`

    const textWidth = font.widthOfTextAtSize(text, options.fontSize)
    const textHeight = options.fontSize
    const hMargin = Math.max(8, Math.min(40, width * 0.04))
    const vMargin = Math.max(8, Math.min(40, height * 0.04))
    const safeH = Math.max(hMargin, textWidth / 2 + 3)
    const safeV = Math.max(vMargin, textHeight + 3)

    let x = 0
    let y = 0

    switch (options.position) {
      case 'bottom-center':
        x = Math.max(safeH, Math.min(width - safeH - textWidth, (width - textWidth) / 2)) + xOffset
        y = safeV + yOffset
        break
      case 'bottom-left':
        x = safeH + xOffset
        y = safeV + yOffset
        break
      case 'bottom-right':
        x = Math.max(safeH, width - safeH - textWidth) + xOffset
        y = safeV + yOffset
        break
      case 'top-center':
        x = Math.max(safeH, Math.min(width - safeH - textWidth, (width - textWidth) / 2)) + xOffset
        y = height - safeV - textHeight + yOffset
        break
      case 'top-left':
        x = safeH + xOffset
        y = height - safeV - textHeight + yOffset
        break
      case 'top-right':
        x = Math.max(safeH, width - safeH - textWidth) + xOffset
        y = height - safeV - textHeight + yOffset
        break
    }

    x = Math.max(xOffset + 3, Math.min(xOffset + width - textWidth - 3, x))
    y = Math.max(yOffset + 3, Math.min(yOffset + height - textHeight - 3, y))

    page.drawText(text, {
      x,
      y,
      font,
      size: options.fontSize,
      color: rgb(0.18, 0.18, 0.22),
    })
  }

  return doc.save()
}

function computeTileCenters(options: {
  pageWidth: number
  pageHeight: number
  itemWidth: number
  itemHeight: number
  angle: number
  gapX: number
  gapY: number
}): Array<{ x: number; y: number }> {
  const { pageWidth, pageHeight, itemWidth, itemHeight } = options
  if (!(pageWidth > 0) || !(pageHeight > 0) || !(itemWidth > 0) || !(itemHeight > 0) || !Number.isFinite(options.angle)) {
    return []
  }

  const rad = (options.angle * Math.PI) / 180
  const ux = Math.cos(rad)
  const uy = Math.sin(rad)
  const vx = -Math.sin(rad)
  const vy = Math.cos(rad)

  let stepX = Math.max(itemWidth * (1 + Math.max(0, options.gapX)), 1)
  let stepY = Math.max(itemHeight * (1 + Math.max(0, options.gapY)), 1)

  const density = (pageWidth * pageHeight) / (stepX * stepY)
  if (density > MAX_TILES) {
    const factor = Math.sqrt(density / MAX_TILES)
    stepX *= factor
    stepY *= factor
  }

  const centerX = pageWidth / 2
  const centerY = pageHeight / 2
  const reach = Math.hypot(pageWidth, pageHeight) / 2
  const radius = Math.hypot(itemWidth, itemHeight) / 2
  const halfExtentX = (Math.abs(ux) * itemWidth + Math.abs(vx) * itemHeight) / 2
  const halfExtentY = (Math.abs(uy) * itemWidth + Math.abs(vy) * itemHeight) / 2
  const iMax = Math.ceil((reach + radius) / stepX)
  const jMax = Math.ceil((reach + radius) / stepY)

  const centers: Array<{ x: number; y: number }> = []
  for (let j = -jMax; j <= jMax; j += 1) {
    for (let i = -iMax; i <= iMax; i += 1) {
      const x = centerX + i * stepX * ux + j * stepY * vx
      const y = centerY + i * stepX * uy + j * stepY * vy
      if (
        x + halfExtentX < 0 ||
        x - halfExtentX > pageWidth ||
        y + halfExtentY < 0 ||
        y - halfExtentY > pageHeight
      ) {
        continue
      }
      centers.push({ x, y })
      if (centers.length >= MAX_TILES * 2) return centers
    }
  }
  return centers
}

/** Đóng dấu mờ chữ tiếng Việt có dấu bằng canvas 2× DPR -> PNG (tham chiếu cit-pdf). */
export async function addWatermarkToPdf(
  pdfBytes: Uint8Array,
  options: {
    text: string
    fontSize: number
    opacity: number
    angle: number
    colorHex: string
    tile: boolean
    targetPages?: number[]
  },
): Promise<Uint8Array> {
  const cleanText = options.text.trim()
  if (!cleanText) throw new Error('Hãy nhập nội dung dấu mờ.')

  const { PDFDocument, degrees } = await import('pdf-lib')
  const doc = await PDFDocument.load(pdfBytes, { throwOnInvalidObject: false })
  const color = hexToRgb01(options.colorHex)

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Không thể khởi tạo canvas tạo dấu mờ.')

  let pngBytes: Uint8Array
  const dpr = 2
  try {
    const fontStr = `bold ${options.fontSize * dpr}px "Inter Variable", system-ui, -apple-system, Arial, sans-serif`
    ctx.font = fontStr
    const metrics = ctx.measureText(cleanText)
    canvas.width = Math.max(8, Math.ceil(metrics.width) + 12)
    canvas.height = Math.max(8, Math.ceil(options.fontSize * dpr * 1.45))

    ctx.font = fontStr
    ctx.fillStyle = `rgb(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)})`
    ctx.textBaseline = 'middle'
    ctx.fillText(cleanText, 6, canvas.height / 2)

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('Không thể xuất ảnh dấu mờ.'))),
        'image/png',
      )
    })
    pngBytes = new Uint8Array(await blob.arrayBuffer())
  } finally {
    canvas.width = 0
    canvas.height = 0
  }

  const image = await doc.embedPng(pngBytes)
  const imgW = image.width / dpr
  const imgH = image.height / dpr
  const rad = (options.angle * Math.PI) / 180
  const halfW = imgW / 2
  const halfH = imgH / 2
  const targetSet = options.targetPages?.length ? new Set(options.targetPages) : null
  const pages = doc.getPages()

  pages.forEach((page, index) => {
    if (targetSet && !targetSet.has(index + 1)) return
    const { width, height } = page.getSize()
    const centers = options.tile
      ? computeTileCenters({
          pageWidth: width,
          pageHeight: height,
          itemWidth: imgW,
          itemHeight: imgH,
          angle: options.angle,
          gapX: DEFAULT_TILE_GAP_X,
          gapY: DEFAULT_TILE_GAP_Y,
        })
      : [{ x: width / 2, y: height / 2 }]

    for (const { x: cx, y: cy } of centers) {
      page.drawImage(image, {
        x: cx - Math.cos(rad) * halfW + Math.sin(rad) * halfH,
        y: cy - Math.sin(rad) * halfW - Math.cos(rad) * halfH,
        width: imgW,
        height: imgH,
        opacity: options.opacity,
        rotate: degrees(options.angle),
      })
    }
  })

  return doc.save()
}

/** Phát hiện trang trắng bằng cách đo tỉ lệ pixel khác trắng ở độ phân giải 0.4×. */
export async function detectBlankPages(
  pdfBytes: Uint8Array,
  sensitivity: number,
  onProgress?: (done: number, total: number) => void,
): Promise<BlankPageMatch[]> {
  const pdfjs = await loadPdfjs()
  const loadingTask = pdfjs.getDocument({ data: pdfBytes.slice() })
  const doc = await loadingTask.promise
  const matches: BlankPageMatch[] = []
  const maxNonWhitePercent = 5 - (Math.min(100, Math.max(0, sensitivity)) / 100) * 4.9
  const canvas = document.createElement('canvas')

  try {
    const total = doc.numPages
    for (let i = 1; i <= total; i += 1) {
      onProgress?.(i, total)
      const page = await doc.getPage(i)
      const viewport = page.getViewport({ scale: 0.4 })
      canvas.width = Math.max(1, Math.ceil(viewport.width))
      canvas.height = Math.max(1, Math.ceil(viewport.height))
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) continue

      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvas, canvasContext: ctx, viewport }).promise

      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      const totalPixels = data.length / 4
      let nonWhite = 0
      for (let p = 0; p < data.length; p += 4) {
        const brightness = (data[p] + data[p + 1] + data[p + 2]) / 3
        if (brightness < 240) nonWhite += 1
      }
      const nonWhitePercent = (nonWhite / Math.max(1, totalPixels)) * 100

      if (nonWhitePercent <= maxNonWhitePercent) {
        const thumbBlob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.65)
        })
        const thumbnailUrl = thumbBlob ? URL.createObjectURL(thumbBlob) : ''
        matches.push({ pageNumber: i, nonWhitePercent, thumbnailUrl })
      }
    }
    return matches
  } finally {
    canvas.width = 0
    canvas.height = 0
    await loadingTask.destroy()
  }
}

export async function removePagesFromPdf(pdfBytes: Uint8Array, pagesToRemove: number[]): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib')
  const source = await PDFDocument.load(pdfBytes, { throwOnInvalidObject: false })
  const removeSet = new Set(pagesToRemove)
  const total = source.getPageCount()
  const keepIndices: number[] = []
  for (let i = 0; i < total; i += 1) {
    if (!removeSet.has(i + 1)) keepIndices.push(i)
  }

  if (!keepIndices.length) {
    throw new Error('Không thể xóa toàn bộ trang của file PDF.')
  }

  const out = await PDFDocument.create()
  const copied = await out.copyPages(source, keepIndices)
  copied.forEach((page) => out.addPage(page))
  return out.save()
}

/** Gộp 2 hoặc 4 trang lên 1 mặt giấy A4 (tiện in đề thi, phiếu ôn tập tiết kiệm giấy). */
export async function createNupPdf(
  pdfBytes: Uint8Array,
  pagesPerSheet: 2 | 4,
  onProgress?: (done: number, total: number) => void,
): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib')
  const source = await PDFDocument.load(pdfBytes, { throwOnInvalidObject: false })
  const out = await PDFDocument.create()
  const sourcePages = source.getPages()

  const cols = 2
  const rows = pagesPerSheet === 2 ? 1 : 2
  const [pageWidth, pageHeight] = pagesPerSheet === 2 ? A4_LANDSCAPE : A4_PORTRAIT
  const margin = 18
  const gutter = 12

  const usableWidth = pageWidth - margin * 2
  const usableHeight = pageHeight - margin * 2
  const cellWidth = (usableWidth - gutter * (cols - 1)) / cols
  const cellHeight = (usableHeight - gutter * (rows - 1)) / rows
  const sheetCount = Math.ceil(sourcePages.length / pagesPerSheet)

  for (let i = 0; i < sourcePages.length; i += pagesPerSheet) {
    onProgress?.(Math.floor(i / pagesPerSheet) + 1, sheetCount)
    const chunk = sourcePages.slice(i, i + pagesPerSheet)
    const outPage = out.addPage([pageWidth, pageHeight])

    for (let j = 0; j < chunk.length; j += 1) {
      if (!chunk[j].node.Contents()) continue
      let embedded
      try {
        embedded = await out.embedPage(chunk[j])
      } catch (error) {
        if (error instanceof Error && error.message.includes('missing Contents')) continue
        throw error
      }
      const scale = Math.min(cellWidth / embedded.width, cellHeight / embedded.height)
      const scaledW = embedded.width * scale
      const scaledH = embedded.height * scale

      const row = Math.floor(j / cols)
      const col = j % cols
      const cellX = margin + col * (cellWidth + gutter)
      const cellY = pageHeight - margin - (row + 1) * cellHeight - row * gutter

      outPage.drawPage(embedded, {
        x: cellX + (cellWidth - scaledW) / 2,
        y: cellY + (cellHeight - scaledH) / 2,
        width: scaledW,
        height: scaledH,
      })
    }
  }

  return out.save()
}

/** Dựng thumbnail từng trang PDF để sắp xếp, xoay hoặc xóa trực quan. */
export async function renderPageThumbnails(
  pdfBytes: Uint8Array,
  onProgress?: (done: number, total: number) => void,
): Promise<string[]> {
  const pdfjs = await loadPdfjs()
  const loadingTask = pdfjs.getDocument({ data: pdfBytes.slice() })
  const doc = await loadingTask.promise
  const urls: string[] = []
  const canvas = document.createElement('canvas')

  try {
    const total = doc.numPages
    for (let i = 1; i <= total; i += 1) {
      onProgress?.(i, total)
      const page = await doc.getPage(i)
      const base = page.getViewport({ scale: 1 })
      const scale = Math.min(0.45, 220 / Math.max(base.width, base.height))
      const viewport = page.getViewport({ scale })
      canvas.width = Math.max(1, Math.ceil(viewport.width))
      canvas.height = Math.max(1, Math.ceil(viewport.height))
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        urls.push('')
        continue
      }
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvas, canvasContext: ctx, viewport }).promise
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((res) => resolve(res), 'image/jpeg', 0.65)
      })
      urls.push(blob ? URL.createObjectURL(blob) : '')
    }
    return urls
  } catch (error) {
    urls.forEach((url) => {
      if (url) URL.revokeObjectURL(url)
    })
    throw error
  } finally {
    canvas.width = 0
    canvas.height = 0
    await loadingTask.destroy()
  }
}

/** Xuất PDF mới theo danh sách trang đã sắp xếp, xoay hoặc chèn trang trắng. */
export async function applyOrganizePlan(pdfBytes: Uint8Array, plan: OrganizePageSpec[]): Promise<Uint8Array> {
  if (!plan.length) {
    throw new Error('Cần giữ lại ít nhất 1 trang để xuất PDF.')
  }

  const { PDFDocument, degrees } = await import('pdf-lib')
  const source = await PDFDocument.load(pdfBytes, { throwOnInvalidObject: false })
  const out = await PDFDocument.create()
  const firstPage = source.getPages()[0]
  const blankSize: [number, number] = firstPage
    ? [firstPage.getWidth(), firstPage.getHeight()]
    : A4_PORTRAIT

  for (const item of plan) {
    if (item.kind === 'blank') {
      out.addPage(blankSize)
      continue
    }
    const [copied] = await out.copyPages(source, [item.sourceIndex])
    if (item.rotation !== 0) {
      const current = copied.getRotation().angle
      copied.setRotation(degrees((current + item.rotation) % 360))
    }
    out.addPage(copied)
  }

  return out.save()
}

/** Chuẩn hóa toàn bộ trang về cùng khổ A4 hoặc A5. */
export async function standardizePageSize(
  pdfBytes: Uint8Array,
  options: {
    size: 'A4' | 'A5'
    orientation: 'auto' | 'portrait' | 'landscape'
    mode: 'fit' | 'fill'
  },
  onProgress?: (done: number, total: number) => void,
): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await import('pdf-lib')
  const source = await PDFDocument.load(pdfBytes, { throwOnInvalidObject: false })
  const out = await PDFDocument.create()
  const sourcePages = source.getPages()

  const baseSize: [number, number] = options.size === 'A5' ? [419.53, 595.28] : A4_PORTRAIT

  for (let i = 0; i < sourcePages.length; i += 1) {
    onProgress?.(i + 1, sourcePages.length)
    const srcPage = sourcePages[i]
    const { width: srcW, height: srcH } = srcPage.getSize()

    let targetW = baseSize[0]
    let targetH = baseSize[1]

    if (options.orientation === 'landscape') {
      ;[targetW, targetH] = [Math.max(targetW, targetH), Math.min(targetW, targetH)]
    } else if (options.orientation === 'portrait') {
      ;[targetW, targetH] = [Math.min(targetW, targetH), Math.max(targetW, targetH)]
    } else if (srcW > srcH) {
      ;[targetW, targetH] = [Math.max(targetW, targetH), Math.min(targetW, targetH)]
    }

    const outPage = out.addPage([targetW, targetH])
    outPage.drawRectangle({
      x: 0,
      y: 0,
      width: targetW,
      height: targetH,
      color: rgb(1, 1, 1),
    })

    if (!srcPage.node.Contents()) continue
    let embedded
    try {
      embedded = await out.embedPage(srcPage)
    } catch (error) {
      if (error instanceof Error && error.message.includes('missing Contents')) continue
      throw error
    }

    const scaleX = targetW / Math.max(1, embedded.width)
    const scaleY = targetH / Math.max(1, embedded.height)
    const scale = options.mode === 'fill' ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY)
    const drawW = embedded.width * scale
    const drawH = embedded.height * scale

    outPage.drawPage(embedded, {
      x: (targetW - drawW) / 2,
      y: (targetH - drawH) / 2,
      width: drawW,
      height: drawH,
    })
  }

  return out.save()
}

/** Cắt lề (mm) cho toàn bộ hoặc danh sách trang chọn bằng CropBox/MediaBox. */
export async function cropPdfMargins(
  pdfBytes: Uint8Array,
  marginsMm: { top: number; right: number; bottom: number; left: number },
  targetPages?: number[],
): Promise<Uint8Array> {
  const mmToPt = 72 / 25.4
  const topPt = Math.max(0, marginsMm.top) * mmToPt
  const rightPt = Math.max(0, marginsMm.right) * mmToPt
  const bottomPt = Math.max(0, marginsMm.bottom) * mmToPt
  const leftPt = Math.max(0, marginsMm.left) * mmToPt

  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.load(pdfBytes, { throwOnInvalidObject: false })
  const targetSet = targetPages?.length ? new Set(targetPages) : null
  const pages = doc.getPages()

  for (let i = 0; i < pages.length; i += 1) {
    if (targetSet && !targetSet.has(i + 1)) continue
    const page = pages[i]
    const bounds = page.getCropBox() || page.getMediaBox()
    const newX = bounds.x + leftPt
    const newY = bounds.y + bottomPt
    const newW = bounds.width - leftPt - rightPt
    const newH = bounds.height - topPt - bottomPt

    if (newW < 36 || newH < 36) {
      throw new Error('Lề cắt quá lớn so với kích thước trang.')
    }

    page.setCropBox(newX, newY, newW, newH)
    page.setMediaBox(newX, newY, newW, newH)
  }

  return doc.save()
}

/** Đọc metadata ẩn hiện có trong file PDF. */
export async function readPdfMetadata(pdfBytes: Uint8Array): Promise<PdfMetadataInfo> {
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.load(pdfBytes, { throwOnInvalidObject: false })
  return {
    title: doc.getTitle() ?? '',
    author: doc.getAuthor() ?? '',
    subject: doc.getSubject() ?? '',
    creator: doc.getCreator() ?? '',
    producer: doc.getProducer() ?? '',
    keywords: doc.getKeywords() ?? '',
  }
}

/** Xóa toàn bộ metadata ẩn (tác giả, phần mềm, XMP, PieceInfo, Trailer ID). */
export async function cleanPdfMetadata(pdfBytes: Uint8Array): Promise<Uint8Array> {
  const { PDFDocument, PDFName } = await import('pdf-lib')
  const doc = await PDFDocument.load(pdfBytes, { throwOnInvalidObject: false })

  doc.setTitle('')
  doc.setAuthor('')
  doc.setSubject('')
  doc.setKeywords([])
  doc.setCreator('')
  doc.setProducer('')

  try {
    doc.catalog.delete(PDFName.of('Metadata'))
    doc.catalog.delete(PDFName.of('PieceInfo'))
  } catch {
    /* bỏ qua nếu PDF không có các khóa này */
  }

  if (doc.context.trailerInfo && 'ID' in doc.context.trailerInfo) {
    delete doc.context.trailerInfo.ID
  }

  return doc.save()
}
