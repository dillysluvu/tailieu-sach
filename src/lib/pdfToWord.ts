import { loadPdfjs } from './pdfjs'

export type TextRunData = { text: string; bold?: boolean; italic?: boolean }

export type ExtractedParagraph = {
  text: string
  heading: boolean
  list: boolean
  bold: boolean
  italic: boolean
  size: number
  align: 'left' | 'center' | 'right' | 'justify'
  runs?: TextRunData[]
}

export type ExtractResult = {
  pages: ExtractedParagraph[][]
  stats: { pages: number; paragraphs: number; chars: number }
}

type RawLine = {
  text: string
  y: number
  height: number
  minX: number
  maxX: number
  bold: boolean
  italic: boolean
  column: number
  pageWidth: number
  yRatio?: number
}

type TextItemLike = {
  str: string
  dir: string
  transform: number[]
  width: number
  height: number
  fontName: string
  hasEOL: boolean
}

const LIST_MARKER = /^(?:[•●▪◦]\s*|[-–—]\s+|\d+[.)]\s+|[a-zA-Z][.)]\s+|\(\d+\)\s+)/
const SENTENCE_END = /[.!?:;]$/

function detectColumns(items: TextItemLike[], pageWidth: number): number {
  const mid = pageWidth / 2
  const left = items.filter((item) => item.transform[4] < mid - pageWidth * 0.04).length
  const right = items.filter((item) => item.transform[4] > mid + pageWidth * 0.04).length
  if (left > items.length * 0.2 && right > items.length * 0.2) return 2
  return 1
}

function lineFromItems(items: TextItemLike[], column: number, pageWidth: number): RawLine | null {
  items.sort((a, b) => a.transform[4] - b.transform[4])
  let text = ''
  let previousRight = Number.NEGATIVE_INFINITY
  let height = 0
  let bold = false
  let italic = false

  for (const item of items) {
    const x = item.transform[4]
    const gap = x - previousRight
    if (text && gap > Math.max(1.5, item.height * 0.35)) text += ' '
    text += item.str
    previousRight = x + item.width
    height = Math.max(height, item.height)
    if (/bold|black|heavy|semibold/i.test(item.fontName)) bold = true
    if (/italic|oblique/i.test(item.fontName)) italic = true
  }

  text = text.replace(/\s+/g, ' ').trim()
  if (!text) return null

  return {
    text,
    y: items[0].transform[5],
    height,
    minX: Math.min(...items.map((item) => item.transform[4])),
    maxX: Math.max(...items.map((item) => item.transform[4] + item.width)),
    bold,
    italic,
    column,
    pageWidth,
  }
}

function groupLines(items: TextItemLike[], columns: number, pageWidth: number): RawLine[] {
  const lines: RawLine[] = []
  for (let column = 0; column < columns; column += 1) {
    const columnItems = items.filter((item) => {
      const x = item.transform[4]
      if (columns === 1) return true
      return column === 0 ? x < pageWidth / 2 : x >= pageWidth / 2
    })
    const groups: TextItemLike[][] = []
    const sorted = columnItems
      .slice()
      .sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4])

    for (const item of sorted) {
      const y = item.transform[5]
      const tolerance = Math.max(2, item.height * 0.5)
      const group = groups.find((candidate) => Math.abs(candidate[0].transform[5] - y) <= tolerance)
      if (group) group.push(item)
      else groups.push([item])
    }

    for (const group of groups) {
      const line = lineFromItems(group, column, pageWidth)
      if (line) lines.push(line)
    }
  }
  return lines.sort((a, b) => b.y - a.y || a.minX - b.minX)
}

function shouldJoin(current: RawLine, next: RawLine, columnWidth: number): boolean {
  if (SENTENCE_END.test(current.text.trim())) return false
  if (LIST_MARKER.test(next.text)) return false
  if (LIST_MARKER.test(current.text)) return false
  if (next.text[0] === next.text[0]?.toUpperCase() && current.maxX - current.minX > columnWidth * 0.75) {
    return false
  }
  return current.maxX - current.minX < columnWidth * 0.86
}

function alignOf(line: RawLine): ExtractedParagraph['align'] {
  const width = line.maxX - line.minX
  if (line.minX < line.pageWidth * 0.12 && line.maxX > line.pageWidth * 0.88) return 'justify'
  if (line.minX > line.pageWidth * 0.6) return 'right'
  const center = (line.minX + line.maxX) / 2
  if (Math.abs(center - line.pageWidth / 2) < line.pageWidth * 0.08 && width < line.pageWidth * 0.7) {
    return 'center'
  }
  return 'left'
}

function toParagraph(lines: RawLine[], columnWidth: number): ExtractedParagraph {
  let text = lines[0].text
  for (let index = 1; index < lines.length; index += 1) {
    const next = lines[index]
    if (/-$/.test(text) && /^[a-zà-ỹ]/.test(next.text)) {
      text = `${text.slice(0, -1)}${next.text}`
    } else if (shouldJoin(lines[index - 1], next, columnWidth)) {
      text = `${text} ${next.text}`
    } else {
      break
    }
  }

  const first = lines[0]
  const size = Math.max(9, Math.min(18, Math.round(first.height * 0.85)))
  return {
    text,
    heading: first.height >= 15 && text.length <= 90 && !SENTENCE_END.test(text),
    list: LIST_MARKER.test(text),
    bold: first.bold,
    italic: first.italic,
    size,
    align: alignOf(first),
  }
}

export async function extractPdfText(bytes: Uint8Array, from = 1, to?: number): Promise<ExtractResult> {
  const pdfjs = await loadPdfjs()
  const task = pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: true })
  const pdf = await task.promise

  try {
    const end = Math.min(to ?? pdf.numPages, pdf.numPages)
    const rawPages: RawLine[][] = []

    for (let pageNumber = from; pageNumber <= end; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      const pageWidth = page.view[2] - page.view[0]
      const pageHeight = page.view[3] - page.view[1]
      const items = content.items.filter(
        (item): item is TextItemLike =>
          'str' in item &&
          typeof item.str === 'string' &&
          item.str.trim().length > 0 &&
          item.height >= 4 &&
          item.height <= 120,
      )
      const columns = detectColumns(items, pageWidth)
      const lines = groupLines(items, columns, pageWidth).map((line) => ({
        ...line,
        yRatio: line.y / pageHeight,
      }))
      rawPages.push(lines)
    }

    const repeats = new Map<string, Set<number>>()
    rawPages.forEach((lines, pageIndex) => {
      lines.forEach((line) => {
        const ratio = line.yRatio ?? 0
        if (ratio > 0.93 || ratio < 0.07) {
          const key = line.text.trim()
          if (!repeats.has(key)) repeats.set(key, new Set())
          repeats.get(key)!.add(pageIndex)
        }
      })
    })
    const ignored = new Set(
      [...repeats.entries()]
        .filter(([, pages]) => pages.size >= Math.max(3, Math.ceil(rawPages.length * 0.5)))
        .map(([text]) => text),
    )

    const pages = rawPages.map((lines) => {
      const kept = lines.filter((line) => !ignored.has(line.text.trim()))
      const columnWidths = new Map<number, number>()
      kept.forEach((line) => {
        const width = line.maxX - line.minX
        columnWidths.set(line.column, Math.max(columnWidths.get(line.column) ?? 0, width))
      })
      const paragraphs: ExtractedParagraph[] = []
      let buffer: RawLine[] = []

      const flush = () => {
        if (!buffer.length) return
        paragraphs.push(toParagraph(buffer, columnWidths.get(buffer[0].column) ?? lineWidth(kept)))
        buffer = []
      }

      for (const line of kept) {
        if (!buffer.length) {
          buffer = [line]
          continue
        }
        if (buffer[0].column !== line.column) {
          flush()
          buffer = [line]
          continue
        }
        const columnWidth = columnWidths.get(line.column) ?? lineWidth(kept)
        const previous = buffer[buffer.length - 1]
        const hyphenJoin = /-$/.test(previous.text) && /^[a-zà-ỹ]/.test(line.text)
        if (hyphenJoin || shouldJoin(previous, line, columnWidth)) {
          buffer.push(line)
        } else {
          flush()
          buffer = [line]
        }
      }
      flush()
      return paragraphs
    })

    const flat = pages.flat()
    return {
      pages,
      stats: {
        pages: pages.length,
        paragraphs: flat.length,
        chars: flat.reduce((sum, paragraph) => sum + paragraph.text.length, 0),
      },
    }
  } finally {
    await task.destroy()
  }
}

function lineWidth(lines: RawLine[]): number {
  return lines.reduce((max, line) => Math.max(max, line.maxX - line.minX), 1)
}

export function toEditableText(result: ExtractResult, keepBreaks: boolean): string {
  const chunks = result.pages.map(
    (paragraphs, index) =>
      `${keepBreaks && index > 0 ? `--- Trang ${index + 1} ---\n\n` : ''}${paragraphs
        .map((paragraph) => paragraph.text)
        .join('\n\n')}`,
  )
  return chunks.join('\n\n').trim()
}

function inlineRuns(value: string): TextRunData[] {
  const runs: TextRunData[] = []
  const pattern = /\*\*[^*]+\*\*|\*[^*]+\*/g
  let cursor = 0
  for (const match of value.matchAll(pattern)) {
    const start = match.index ?? 0
    if (start > cursor) runs.push({ text: value.slice(cursor, start) })
    const token = match[0]
    if (token.startsWith('**')) runs.push({ text: token.slice(2, -2), bold: true })
    else runs.push({ text: token.slice(1, -1), italic: true })
    cursor = start + token.length
  }
  if (cursor < value.length) runs.push({ text: value.slice(cursor) })
  return runs.filter((run) => run.text.length > 0)
}

export function parseEditedText(text: string): ExtractResult['pages'] {
  const parts = text.split(/^--- Trang \d+ ---\s*$/m)
  return parts
    .map((part) =>
      part
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map<ExtractedParagraph>((line) => {
          let value = line
          const heading = /^#\s+/.test(value)
          if (heading) value = value.replace(/^#\s+/, '')
          const list = /^[-*]\s+/.test(value)
          if (list) value = value.replace(/^[-*]\s+/, '')
          const runs = inlineRuns(value)
          return {
            text: runs.map((run) => run.text).join(''),
            heading,
            list,
            bold: runs[0]?.bold ?? false,
            italic: runs[0]?.italic ?? false,
            size: 11,
            align: 'left',
            runs,
          }
        }),
    )
    .filter((page) => page.length > 0)
}

export async function buildDocx(pages: ExtractResult['pages'], keepBreaks: boolean): Promise<Uint8Array> {
  const { AlignmentType, Document, HeadingLevel, Packer, PageBreak, Paragraph, TextRun } = await import('docx')

  const children = pages.flatMap((paragraphs, pageIndex) => {
    const nodes = paragraphs.map((paragraph) =>
      new Paragraph({
        children: (paragraph.runs ?? [
          { text: paragraph.text, bold: paragraph.bold, italic: paragraph.italic },
        ]).map(
          (run) =>
            new TextRun({
              text: run.text,
              size: paragraph.size * 2,
              bold: run.bold,
              italics: run.italic,
            }),
        ),
        heading: paragraph.heading ? HeadingLevel.HEADING_2 : undefined,
        bullet: paragraph.list ? { level: 0 } : undefined,
        alignment:
          paragraph.align === 'center'
            ? AlignmentType.CENTER
            : paragraph.align === 'right'
              ? AlignmentType.RIGHT
              : paragraph.align === 'justify'
                ? AlignmentType.JUSTIFIED
                : AlignmentType.LEFT,
        spacing: { after: 120 },
      }),
    )
    if (keepBreaks && pageIndex < pages.length - 1) {
      nodes.push(new Paragraph({ children: [new PageBreak()] }))
    }
    return nodes
  })

  const document = new Document({ sections: [{ children }] })
  const blob = await Packer.toBlob(document)
  return new Uint8Array(await blob.arrayBuffer())
}
