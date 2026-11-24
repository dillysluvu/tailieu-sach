import { loadPdfjs } from './pdfjs'

export type SubjectPreset = 'math' | 'literature' | 'general'
export type ConvertMode = 'ai' | 'offline'

export type PdfToWordResult = {
  markdown: string
  docxBytes: Uint8Array
  pageCount: number
}

export type AiServerStatus = {
  aiConfigured: boolean
  pinRequired: boolean
}

export function normalizeLatexForDocx(markdown: string): string {
  return markdown
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, expr: string) => `\n$$\n${expr.trim()}\n$$\n`)
    .replace(/\\\((.+?)\\\)/g, (_match, expr: string) => `$${expr.trim()}$`)
}

export async function checkAiServerStatus(): Promise<AiServerStatus> {
  try {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 3500)
    const response = await fetch('/api/pdf-to-word', {
      method: 'GET',
      signal: controller.signal,
    })
    window.clearTimeout(timer)
    if (!response.ok) return { aiConfigured: false, pinRequired: false }
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('application/json')) return { aiConfigured: false, pinRequired: false }
    const data = (await response.json()) as Partial<AiServerStatus>
    return {
      aiConfigured: Boolean(data.aiConfigured),
      pinRequired: Boolean(data.pinRequired),
    }
  } catch {
    return { aiConfigured: false, pinRequired: false }
  }
}

function arrayBufferToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

async function fileToJpegBase64(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  try {
    const maxEdge = 2000
    const ratio = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio))
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Không thể đọc ảnh.')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('Không thể nén ảnh gửi đi.'))),
        'image/jpeg',
        0.88,
      )
    })
    return arrayBufferToBase64(new Uint8Array(await blob.arrayBuffer()))
  } finally {
    bitmap.close()
  }
}

async function renderPdfPagesToBase64(
  pdfBytes: Uint8Array,
  pages: number[],
  onProgress?: (label: string) => void,
): Promise<string[]> {
  const pdfjs = await loadPdfjs()
  const loadingTask = pdfjs.getDocument({ data: pdfBytes.slice() })
  const doc = await loadingTask.promise
  const encoded: string[] = []

  try {
    const canvas = document.createElement('canvas')
    for (let i = 0; i < pages.length; i += 1) {
      const pageNumber = pages[i]
      onProgress?.(`Đang chuẩn bị trang ${pageNumber} (${i + 1}/${pages.length})…`)
      const page = await doc.getPage(pageNumber)
      const base = page.getViewport({ scale: 1 })
      const scale = Math.min(2.2, 1750 / Math.max(base.width, base.height))
      const viewport = page.getViewport({ scale })
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Không thể khởi tạo canvas.')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvas, canvasContext: ctx, viewport }).promise
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (result) => (result ? resolve(result) : reject(new Error(`Không thể đọc trang ${pageNumber}.`))),
          'image/jpeg',
          0.86,
        )
      })
      encoded.push(arrayBufferToBase64(new Uint8Array(await blob.arrayBuffer())))
    }
    canvas.width = 0
    canvas.height = 0
    return encoded
  } finally {
    await loadingTask.destroy()
  }
}

type StyledSpan = {
  text: string
  bold: boolean
  italic: boolean
}

type PositionedItem = {
  x: number
  width: number
  text: string
  bold: boolean
  italic: boolean
}

type LineBlock = {
  y: number
  height: number
  left: number
  right: number
  segments: Array<{ x: number; spans: StyledSpan[]; plain: string }>
}

type OfflineBlock =
  | { kind: 'paragraph'; spans: StyledSpan[]; alignCenter: boolean; fontSizePt: number }
  | { kind: 'table'; rows: string[][]; borderless: boolean }
  | { kind: 'image'; bytes: Uint8Array; width: number; height: number; pageNumber: number }
  | { kind: 'pagebreak' }

function mergeAdjacentSpans(spans: StyledSpan[]): StyledSpan[] {
  const merged: StyledSpan[] = []
  for (const span of spans) {
    if (!span.text) continue
    const last = merged[merged.length - 1]
    if (last && last.bold === span.bold && last.italic === span.italic) {
      last.text += span.text
    } else {
      merged.push({ ...span })
    }
  }
  return merged
}

function itemsToSpans(items: PositionedItem[]): StyledSpan[] {
  const spans: StyledSpan[] = []
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]
    const prev = i > 0 ? items[i - 1] : null
    if (prev) {
      const gap = item.x - (prev.x + prev.width)
      if (gap > 1.2 && !prev.text.endsWith(' ') && !item.text.startsWith(' ')) {
        spans.push({ text: ' ', bold: false, italic: false })
      }
    }
    spans.push({ text: item.text, bold: item.bold, italic: item.italic })
  }
  return mergeAdjacentSpans(spans)
}

function splitLineIntoSegments(
  items: PositionedItem[],
  gapThreshold: number,
): Array<{ x: number; spans: StyledSpan[]; plain: string }> {
  const sorted = [...items].sort((a, b) => a.x - b.x)
  const groups: PositionedItem[][] = []
  let current: PositionedItem[] = []

  for (const item of sorted) {
    const prev = current[current.length - 1]
    if (prev && item.x - (prev.x + prev.width) > gapThreshold) {
      groups.push(current)
      current = [item]
    } else {
      current.push(item)
    }
  }
  if (current.length) groups.push(current)

  return groups
    .map((group) => {
      const spans = itemsToSpans(group)
      const plain = spans
        .map((s) => s.text)
        .join('')
        .replace(/\s+/g, ' ')
        .trim()
      return { x: group[0].x, spans, plain }
    })
    .filter((seg) => seg.plain.length > 0)
}

function medianNumber(values: number[], fallback: number): number {
  if (!values.length) return fallback
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function isBorderlessGrid(rows: string[][]): boolean {
  const joined = rows.flat().join(' ')
  if (/\b[A-D]\s*[.)]/.test(joined)) return true
  if (rows.length <= 3 && rows.every((r) => r.length === 2)) return true
  return false
}

function blocksToMarkdownPreview(blocks: OfflineBlock[]): string {
  const out: string[] = []
  for (const block of blocks) {
    if (block.kind === 'pagebreak') {
      out.push('---')
      continue
    }
    if (block.kind === 'image') {
      out.push(`*(Trang ${block.pageNumber} là bản scan/ảnh — đã nhúng trực tiếp ảnh vào file Word)*`)
      continue
    }
    if (block.kind === 'table') {
      const colCount = Math.max(...block.rows.map((r) => r.length), 1)
      const normRows = block.rows.map((r) => {
        const padded = [...r]
        while (padded.length < colCount) padded.push('')
        return `| ${padded.map((c) => c.replace(/\|/g, '\\|')).join(' | ')} |`
      })
      const sep = `| ${Array.from({ length: colCount }, () => '---').join(' | ')} |`
      if (normRows.length >= 1) {
        out.push([normRows[0], sep, ...normRows.slice(1)].join('\n'))
      }
      continue
    }
    const text = block.spans
      .map((s) => {
        const clean = s.text.trim()
        if (!clean) return s.text
        const lead = s.text.startsWith(' ') ? ' ' : ''
        const tail = s.text.endsWith(' ') ? ' ' : ''
        if (s.bold && s.italic) return `${lead}***${clean}***${tail}`
        if (s.bold) return `${lead}**${clean}**${tail}`
        if (s.italic) return `${lead}*${clean}*${tail}`
        return s.text
      })
      .join('')
      .replace(/\s+/g, ' ')
      .trim()
    if (!text) continue
    out.push(block.fontSizePt >= 15 ? `## ${text}` : text)
  }
  return out.join('\n\n')
}

async function buildStructuredDocxFromBlocks(blocks: OfflineBlock[]): Promise<Uint8Array> {
  const {
    AlignmentType,
    BorderStyle,
    Document,
    ImageRun,
    Packer,
    PageBreak,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
  } = await import('docx')

  const children: Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>> = []

  for (const block of blocks) {
    if (block.kind === 'pagebreak') {
      children.push(new Paragraph({ children: [new PageBreak()] }))
      continue
    }

    if (block.kind === 'image') {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              type: 'jpg',
              data: block.bytes,
              transformation: {
                width: block.width,
                height: block.height,
              },
            }),
          ],
        }),
      )
      continue
    }

    if (block.kind === 'table') {
      const colCount = Math.max(...block.rows.map((r) => r.length), 1)
      const borderStyle = block.borderless ? BorderStyle.NONE : BorderStyle.SINGLE
      const borderColor = block.borderless ? 'FFFFFF' : 'CBD5E1'
      const borderSize = block.borderless ? 0 : 4

      const table = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: borderStyle, size: borderSize, color: borderColor },
          bottom: { style: borderStyle, size: borderSize, color: borderColor },
          left: { style: borderStyle, size: borderSize, color: borderColor },
          right: { style: borderStyle, size: borderSize, color: borderColor },
          insideHorizontal: { style: borderStyle, size: borderSize, color: borderColor },
          insideVertical: { style: borderStyle, size: borderSize, color: borderColor },
        },
        rows: block.rows.map((row) => {
          const cells: string[] = [...row]
          while (cells.length < colCount) cells.push('')
          return new TableRow({
            children: cells.map(
              (cellText) =>
                new TableCell({
                  width: { size: Math.floor(100 / colCount), type: WidthType.PERCENTAGE },
                  children: [
                    new Paragraph({
                      spacing: { after: 60, line: 300 },
                      children: [
                        new TextRun({
                          text: cellText,
                          font: 'Times New Roman',
                          size: 26,
                        }),
                      ],
                    }),
                  ],
                }),
            ),
          })
        }),
      })
      children.push(table)
      continue
    }

    const runs = block.spans.map(
      (s) =>
        new TextRun({
          text: s.text,
          bold: s.bold || block.fontSizePt >= 15,
          italics: s.italic,
          font: 'Times New Roman',
          size: Math.round(block.fontSizePt * 2),
        }),
    )

    children.push(
      new Paragraph({
        alignment: block.alignCenter ? AlignmentType.CENTER : AlignmentType.LEFT,
        spacing: { after: 120, line: 320 },
        children: runs,
      }),
    )
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1134,
              right: 1134,
              bottom: 1134,
              left: 1134,
            },
          },
        },
        children,
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  return new Uint8Array(await blob.arrayBuffer())
}

/** Chuyển PDF → Word Offline thông minh: giữ đậm/nghiêng, căn giữa, bảng/cột đáp án A B C D, ngắt dòng thơ & nhúng trang scan. */
export async function convertOfflineToDocx(
  pdfBytes: Uint8Array,
  pages: number[],
  onProgress?: (label: string) => void,
): Promise<PdfToWordResult> {
  const pdfjs = await loadPdfjs()
  const loadingTask = pdfjs.getDocument({ data: pdfBytes.slice() })
  const doc = await loadingTask.promise
  const allBlocks: OfflineBlock[] = []

  try {
    for (let i = 0; i < pages.length; i += 1) {
      const pageNumber = pages[i]
      onProgress?.(`Đang phân tích bố cục trang ${pageNumber} (${i + 1}/${pages.length})…`)
      if (i > 0) allBlocks.push({ kind: 'pagebreak' })

      const page = await doc.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      const styles = (content.styles ?? {}) as Record<string, { fontFamily?: string }>

      type RawLine = { y: number; height: number; items: PositionedItem[] }
      const rawLines: RawLine[] = []

      for (const rawItem of content.items) {
        if (!('str' in rawItem) || !rawItem.str) continue
        const x = rawItem.transform[4]
        const y = rawItem.transform[5]
        const height = Math.abs(rawItem.transform[3]) || rawItem.height || 12
        const width = rawItem.width || rawItem.str.length * height * 0.45
        const fontKey = `${rawItem.fontName} ${styles[rawItem.fontName]?.fontFamily ?? ''}`.toLowerCase()
        const bold = /(bold|black|heavy|semibold|demi|\b700\b|\b800\b)/.test(fontKey)
        const italic = /(italic|oblique|\bslanted\b)/.test(fontKey)

        const existing = rawLines.find((line) => Math.abs(line.y - y) <= Math.max(3, height * 0.45))
        if (existing) {
          existing.items.push({ x, width, text: rawItem.str, bold, italic })
          existing.height = Math.max(existing.height, height)
        } else {
          rawLines.push({ y, height, items: [{ x, width, text: rawItem.str, bold, italic }] })
        }
      }

      const hasText = rawLines.some((l) => l.items.some((it) => it.text.trim().length > 0))
      if (!hasText) {
        onProgress?.(`Trang ${pageNumber} là bản scan — đang nhúng ảnh vào Word…`)
        const scale = Math.min(2.0, 1500 / Math.max(viewport.width, viewport.height))
        const renderViewport = page.getViewport({ scale })
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(renderViewport.width)
        canvas.height = Math.ceil(renderViewport.height)
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          await page.render({ canvas, canvasContext: ctx, viewport: renderViewport }).promise
          const blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
              (res) => (res ? resolve(res) : reject(new Error(`Không thể đọc trang ${pageNumber}.`))),
              'image/jpeg',
              0.88,
            )
          })
          const imgBytes = new Uint8Array(await blob.arrayBuffer())
          const drawW = 460
          const drawH = Math.max(120, Math.round((drawW * canvas.height) / canvas.width))
          allBlocks.push({ kind: 'image', bytes: imgBytes, width: drawW, height: drawH, pageNumber })
        }
        canvas.width = 0
        canvas.height = 0
        continue
      }

      rawLines.sort((a, b) => b.y - a.y)
      const bodyHeight = medianNumber(
        rawLines.map((l) => l.height),
        12,
      )
      const gapThreshold = Math.max(18, bodyHeight * 2.3)

      const lines: LineBlock[] = rawLines
        .map((line) => {
          const segments = splitLineIntoSegments(line.items, gapThreshold)
          const sorted = [...line.items].sort((a, b) => a.x - b.x)
          const left = sorted[0]?.x ?? 0
          const last = sorted[sorted.length - 1]
          const right = last ? last.x + last.width : left
          return { y: line.y, height: line.height, left, right, segments }
        })
        .filter((l) => l.segments.length > 0)

      let tableRows: string[][] = []
      let currentPara: { spans: StyledSpan[]; alignCenter: boolean; fontSizePt: number } | null = null
      let prevY: number | null = null
      let prevHeight = bodyHeight
      let prevRight = viewport.width

      const flushParagraph = () => {
        if (!currentPara) return
        const hasVisible = currentPara.spans.some((s) => s.text.trim().length > 0)
        if (hasVisible) {
          allBlocks.push({
            kind: 'paragraph',
            spans: mergeAdjacentSpans(currentPara.spans),
            alignCenter: currentPara.alignCenter,
            fontSizePt: currentPara.fontSizePt,
          })
        }
        currentPara = null
      }

      const flushTable = () => {
        if (!tableRows.length) return
        allBlocks.push({
          kind: 'table',
          rows: tableRows,
          borderless: isBorderlessGrid(tableRows),
        })
        tableRows = []
      }

      for (const line of lines) {
        if (line.segments.length >= 2 && line.segments.length <= 5) {
          flushParagraph()
          tableRows.push(line.segments.map((seg) => seg.plain))
          prevY = line.y
          prevHeight = line.height
          prevRight = line.right
          continue
        }

        flushTable()

        const seg = line.segments[0]
        const lineText = seg.plain
        const lineWidth = line.right - line.left
        const lineCenter = (line.left + line.right) / 2
        const alignCenter =
          lineWidth < viewport.width * 0.78 && Math.abs(lineCenter - viewport.width / 2) < viewport.width * 0.085
        const isHeading = line.height >= bodyHeight * 1.22
        const fontSizePt = isHeading ? Math.min(18, Math.max(14, Math.round(line.height * 1.1))) : 13

        const gap = prevY !== null ? prevY - line.y : 0
        const prevEndedShort = prevRight < viewport.width * 0.68
        const startsNew =
          currentPara === null ||
          prevY === null ||
          gap > prevHeight * 1.55 ||
          isHeading ||
          alignCenter ||
          currentPara.alignCenter ||
          prevEndedShort ||
          /^(Câu|Bài|Phần|Chương|Mục|Đề|I+\.|[A-D]\.|[0-9]+[.)]|[-–•])\s/i.test(lineText)

        if (startsNew) {
          flushParagraph()
          currentPara = { spans: seg.spans, alignCenter, fontSizePt }
        } else if (currentPara) {
          currentPara.spans.push({ text: ' ', bold: false, italic: false }, ...seg.spans)
        }

        prevY = line.y
        prevHeight = line.height
        prevRight = line.right
      }

      flushTable()
      flushParagraph()
    }
  } finally {
    await loadingTask.destroy()
  }

  onProgress?.('Đang đóng gói file Word (.docx)…')
  const docxBytes = await buildStructuredDocxFromBlocks(allBlocks)
  const markdown = blocksToMarkdownPreview(allBlocks)
  return { markdown, docxBytes, pageCount: pages.length }
}

export async function markdownToDocxBytes(markdown: string): Promise<Uint8Array> {
  const { default: markdownDocx, Packer } = await import('markdown-docx')
  const normalized = normalizeLatexForDocx(markdown)
  const doc = await markdownDocx(normalized, {
    ignoreImage: true,
    math: {
      engine: 'katex',
      katexOptions: { throwOnError: false, strict: false },
    },
    theme: {
      bodyFont: 'Times New Roman',
      headingFont: 'Times New Roman',
      bodySize: 13,
      lineSpacing: 1.35,
      margin: '2cm',
      heading1: '111827',
      heading2: '111827',
      heading3: '111827',
    },
  })
  const blob = await Packer.toBlob(doc)
  return new Uint8Array(await blob.arrayBuffer())
}

export async function convertWithAi(options: {
  pdfBytes?: Uint8Array | null
  imageFiles?: File[]
  pages: number[]
  subject: SubjectPreset
  pin: string
  geminiKey?: string
  onProgress?: (label: string) => void
}): Promise<PdfToWordResult> {
  const imagesBase64: string[] = []

  if (options.imageFiles?.length) {
    for (let i = 0; i < options.imageFiles.length; i += 1) {
      options.onProgress?.(`Đang chuẩn bị ảnh ${i + 1}/${options.imageFiles.length}…`)
      imagesBase64.push(await fileToJpegBase64(options.imageFiles[i]))
    }
  } else if (options.pdfBytes) {
    imagesBase64.push(...(await renderPdfPagesToBase64(options.pdfBytes, options.pages, options.onProgress)))
  } else {
    throw new Error('Hãy chọn file PDF hoặc ảnh trang sách trước.')
  }

  const pageMarkdowns: string[] = []
  const batchSize = 3
  for (let start = 0; start < imagesBase64.length; start += batchSize) {
    const batch = imagesBase64.slice(start, start + batchSize)
    const fromIdx = start + 1
    const toIdx = Math.min(imagesBase64.length, start + batch.length)
    options.onProgress?.(
      imagesBase64.length > 1
        ? `AI đang đọc & giữ định dạng trang ${fromIdx}–${toIdx} / ${imagesBase64.length}…`
        : 'AI đang đọc & giữ định dạng tài liệu…',
    )

    const response = await fetch('/api/pdf-to-word', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options.pin ? { 'x-access-pin': options.pin } : {}),
        ...(options.geminiKey ? { 'x-gemini-key': options.geminiKey } : {}),
      },
      body: JSON.stringify({
        images: batch,
        subject: options.subject,
      }),
    })

    const data = (await response.json().catch(() => ({}))) as { markdown?: string; error?: string }
    if (!response.ok) {
      throw new Error(
        data.error ||
          (response.status === 404
            ? 'Chưa bật API AI trên máy chủ. Bạn có thể chuyển sang chế độ "Nhanh trên máy (Offline)" ở trên.'
            : `Lỗi kết nối AI (${response.status}).`),
      )
    }
    if (data.markdown) pageMarkdowns.push(data.markdown.trim())
  }

  const markdown = normalizeLatexForDocx(pageMarkdowns.join('\n\n'))
  if (!markdown.trim()) throw new Error('Không đọc được nội dung từ trang đã chọn.')

  options.onProgress?.('Đang tạo file Word (.docx) với công thức chuẩn…')
  const docxBytes = await markdownToDocxBytes(markdown)
  return { markdown, docxBytes, pageCount: imagesBase64.length }
}
