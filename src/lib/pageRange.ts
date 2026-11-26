/**
 * Bộ phân tích khoảng trang hỗ trợ tiếng Việt (tham chiếu từ cit-pdf):
 * chấp nhận "1-4, 7, 9-cuối", "lẻ", "chẵn", dấu gạch dài (– — −) và ";".
 * Mọi số trang đều 1-based.
 */

export function normalizeRangeInput(input: string): string {
  return input
    .toLowerCase()
    .replace(/[–—−]/g, '-')
    .replace(/[;\n]+/g, ',')
    .replace(/cuối|cuoi/g, 'end')
    .replace(/lẻ|le/g, 'odd')
    .replace(/chẵn|chan/g, 'even')
    .replace(/\s+/g, '')
    .replace(/^,+|,+$/g, '')
}

/**
 * Chuyển chuỗi khoảng trang thành danh sách số trang 1-based tăng dần không trùng.
 * Dùng cho Xoay trang, Đóng dấu mờ hoặc chọn nhanh từng nhóm trang.
 */
export function parsePageSelection(
  input: string,
  totalPages: number,
): { pages: number[]; error: string | null } {
  const normalized = normalizeRangeInput(input)
  if (!normalized) {
    return { pages: [], error: 'Hãy nhập khoảng trang, ví dụ: 1-4, 7, 9-cuối hoặc lẻ.' }
  }

  const pages = new Set<number>()
  for (const piece of normalized.split(',')) {
    if (!piece) continue
    if (piece === 'odd' || piece === 'even') {
      for (let page = piece === 'odd' ? 1 : 2; page <= totalPages; page += 2) {
        pages.add(page)
      }
      continue
    }

    const match = /^(\d+|end)(?:-(\d+|end))?$/.exec(piece)
    if (!match) {
      return {
        pages: [],
        error: `Khoảng "${piece}" không hợp lệ. Dùng dạng 1-4, 7, 9-cuối, lẻ hoặc chẵn.`,
      }
    }

    const resolvePage = (token: string) => (token === 'end' ? totalPages : Number(token))
    const from = resolvePage(match[1])
    const to = match[2] ? resolvePage(match[2]) : from

    if (from < 1 || to < 1 || from > totalPages || to > totalPages) {
      return { pages: [], error: `Khoảng "${piece}" nằm ngoài số trang (1–${totalPages}).` }
    }
    if (from > to) {
      return { pages: [], error: `Khoảng "${piece}": trang bắt đầu phải ≤ trang kết thúc.` }
    }

    for (let page = from; page <= to; page += 1) {
      pages.add(page)
    }
  }

  if (pages.size === 0) {
    return { pages: [], error: 'Không có trang nào khớp với khoảng đã nhập.' }
  }

  return { pages: [...pages].sort((a, b) => a - b), error: null }
}

/** Rút gọn danh sách trang thành chuỗi ngắn, ví dụ [1, 2, 3, 5] -> "1–3, 5". */
export function formatPageNumbersShort(pages: number[]): string {
  const sorted = [...new Set(pages)].sort((a, b) => a - b)
  const parts: string[] = []
  for (let i = 0; i < sorted.length; i += 1) {
    const start = sorted[i]
    while (i + 1 < sorted.length && sorted[i + 1] === sorted[i] + 1) {
      i += 1
    }
    parts.push(sorted[i] === start ? `${start}` : `${start}–${sorted[i]}`)
  }
  return parts.join(', ')
}
