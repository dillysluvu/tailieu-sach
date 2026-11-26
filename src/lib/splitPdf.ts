import type { PDFDocument } from 'pdf-lib'
import { formatPageNumbersShort, normalizeRangeInput, parsePageSelection } from './pageRange'

export type SplitMode = 'every' | 'fixed' | 'custom' | 'size'

export type SplitPart = {
  label: string
  pages: number[]
  summary: string
}

export function buildFixedParts(pageCount: number, pagesPerPart: number): SplitPart[] {
  const step = Math.max(1, Math.floor(pagesPerPart))
  const parts: SplitPart[] = []
  let index = 1
  for (let start = 1; start <= pageCount; start += step) {
    const end = Math.min(pageCount, start + step - 1)
    const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i)
    parts.push({
      label: start === end ? `trang-${String(start).padStart(2, '0')}` : `phan-${String(index).padStart(2, '0')}-tr${start}-${end}`,
      pages,
      summary: start === end ? `${start}` : `${start}–${end}`,
    })
    index += 1
  }
  return parts
}

export function parseCustomParts(input: string, pageCount: number): { parts: SplitPart[]; error: string | null } {
  const normalized = normalizeRangeInput(input)
  if (!normalized) {
    return { parts: [], error: 'Hãy nhập khoảng trang, ví dụ: 1-4, 5-cuối hoặc lẻ, chẵn' }
  }

  const raw = normalized.split(',').filter(Boolean)
  const parts: SplitPart[] = []

  for (let i = 0; i < raw.length; i += 1) {
    const token = raw[i]
    const parsed = parsePageSelection(token, pageCount)
    if (parsed.error || !parsed.pages.length) {
      return { parts: [], error: parsed.error ?? `Khoảng "${token}" không hợp lệ.` }
    }
    const pages = parsed.pages
    const summary = formatPageNumbersShort(pages)
    const labelSuffix =
      token === 'odd'
        ? 'trang-le'
        : token === 'even'
          ? 'trang-chan'
          : pages.length === 1
            ? `tr${pages[0]}`
            : `tr${pages[0]}-${pages[pages.length - 1]}`

    parts.push({
      label: `phan-${String(i + 1).padStart(2, '0')}-${labelSuffix}`,
      pages,
      summary,
    })
  }

  return { parts, error: null }
}

export type SplitResult =
  | { kind: 'pdf'; bytes: Uint8Array; filename: string; count: 1 }
  | { kind: 'zip'; bytes: Uint8Array; filename: string; count: number }

export async function splitPdfToArchive(
  source: PDFDocument,
  parts: SplitPart[],
  baseStem: string,
  onProgress?: (current: number, total: number) => void,
): Promise<SplitResult> {
  if (!parts.length) throw new Error('Không có phần nào để tách.')

  const { PDFDocument } = await import('pdf-lib')
  const safeStem = baseStem.replace(/[\\/:*?"<>|]/g, '').trim() || 'tach-pdf'

  if (parts.length === 1) {
    onProgress?.(1, 1)
    const out = await PDFDocument.create()
    const copied = await out.copyPages(
      source,
      parts[0].pages.map((p) => p - 1),
    )
    copied.forEach((page) => out.addPage(page))
    const bytes = await out.save()
    return { kind: 'pdf', bytes, filename: `${safeStem}-${parts[0].label}.pdf`, count: 1 }
  }

  const { zipSync } = await import('fflate')
  const entries: Record<string, Uint8Array> = {}

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]
    onProgress?.(index + 1, parts.length)
    const out = await PDFDocument.create()
    const copied = await out.copyPages(
      source,
      part.pages.map((p) => p - 1),
    )
    copied.forEach((page) => out.addPage(page))
    entries[`${safeStem}-${part.label}.pdf`] = await out.save()
  }

  const zipBytes = zipSync(entries, { level: 0 })
  return { kind: 'zip', bytes: zipBytes, filename: `${safeStem}.zip`, count: parts.length }
}
