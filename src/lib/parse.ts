export function rangeIssue(from: number, to: number, pageCount: number): string | null {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < 1) {
    return 'Nhập số trang từ 1 trở lên'
  }
  if (from > pageCount || to > pageCount) return `Tối đa ${pageCount} trang`
  if (from > to) return 'Trang bắt đầu phải ≤ trang kết thúc'
  return null
}

export function pageIndices(from: number, to: number): number[] {
  const indices: number[] = []
  for (let page = from; page <= to; page += 1) indices.push(page - 1)
  return indices
}

export function totalPages(rows: Array<{ from: number; to: number }>): number {
  return rows.reduce((sum, row) => sum + Math.max(0, row.to - row.from + 1), 0)
}
