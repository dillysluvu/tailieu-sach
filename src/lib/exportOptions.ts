import type { PdfRow } from '../types'

export type PagePreset = 'all' | 'odd' | 'even' | 'last'

export const PAGE_PRESETS: Array<{ value: PagePreset; label: string }> = [
  { value: 'all', label: 'Tất cả' },
  { value: 'odd', label: 'Trang lẻ' },
  { value: 'even', label: 'Trang chẵn' },
  { value: 'last', label: 'Trang cuối' },
]

export function filterPages(pages: number[], preset: PagePreset): number[] {
  if (preset === 'all') return pages
  if (preset === 'last') return pages.length ? [pages[pages.length - 1]] : []
  return pages.filter((page) => (preset === 'odd' ? page % 2 === 1 : page % 2 === 0))
}

export function outputName(value: string, fallback: string, extension = 'pdf'): string {
  const base = value
    .replace(/[\\/:*?"<>|]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
  const stem = base || fallback
  return stem.toLowerCase().endsWith(`.${extension}`) ? stem : `${stem}.${extension}`
}

/** Apply a page preset to merger rows, grouping consecutive pages back into ranges. */
export function applyPresetToRows(rows: PdfRow[], preset: PagePreset): PdfRow[] {
  if (preset === 'all') return rows

  const output: PdfRow[] = []
  for (const row of rows) {
    let buffer: PdfRow | null = null
    for (const page of filterPages(
      Array.from({ length: Math.max(0, row.to - row.from + 1) }, (_, index) => row.from + index),
      preset,
    )) {
      if (buffer && buffer.to === page - 1) {
        buffer.to = page
        continue
      }
      if (buffer) output.push(buffer)
      buffer = { ...row, id: `${row.id}:${page}`, from: page, to: page }
    }
    if (buffer) output.push(buffer)
  }
  return output
}
