import type { PDFDocument } from 'pdf-lib'
import { pageIndices } from './parse'

export type SplitMode = 'every' | 'fixed' | 'custom'

export type SplitPart = {
  label: string
  from: number
  to: number
}

export function buildFixedParts(pageCount: number, pagesPerPart: number): SplitPart[] {
  const step = Math.max(1, Math.floor(pagesPerPart))
  const parts: SplitPart[] = []
  let index = 1
  for (let start = 1; start <= pageCount; start += step) {
    const end = Math.min(pageCount, start + step - 1)
    parts.push({
      label: start === end ? `trang-${String(start).padStart(2, '0')}` : `phan-${String(index).padStart(2, '0')}-tr${start}-${end}`,
      from: start,
      to: end,
    })
    index += 1
  }
  return parts
}

export function parseCustomParts(input: string, pageCount: number): { parts: SplitPart[]; error: string | null } {
  const raw = input
    .split(/[,;\n]+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)

  if (!raw.length) {
    return { parts: [], error: 'Hãy nhập khoảng trang, ví dụ: 1-4, 5-8, 9-12' }
  }

  const parts: SplitPart[] = []
  for (let i = 0; i < raw.length; i += 1) {
    const token = raw[i]
    const match = /^(\d+)(?:\s*[-–]\s*(\d+))?$/.exec(token)
    if (!match) {
      return { parts: [], error: `Khoảng "${token}" không hợp lệ. Dùng dạng 1-4 hoặc 5.` }
    }
    const from = Number(match[1])
    const to = match[2] ? Number(match[2]) : from
    if (from < 1 || to < 1 || from > pageCount || to > pageCount) {
      return { parts: [], error: `Khoảng "${token}" nằm ngoài số trang (1–${pageCount}).` }
    }
    if (from > to) {
      return { parts: [], error: `Khoảng "${token}": trang bắt đầu phải nhỏ hơn hoặc bằng trang cuối.` }
    }
    parts.push({
      label: from === to ? `phan-${String(i + 1).padStart(2, '0')}-tr${from}` : `phan-${String(i + 1).padStart(2, '0')}-tr${from}-${to}`,
      from,
      to,
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
    const copied = await out.copyPages(source, pageIndices(parts[0].from, parts[0].to))
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
    const copied = await out.copyPages(source, pageIndices(part.from, part.to))
    copied.forEach((page) => out.addPage(page))
    entries[`${safeStem}-${part.label}.pdf`] = await out.save()
  }

  const zipBytes = zipSync(entries, { level: 0 })
  return { kind: 'zip', bytes: zipBytes, filename: `${safeStem}.zip`, count: parts.length }
}
