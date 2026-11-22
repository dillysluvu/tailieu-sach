import { loadPdfjs } from './pdfjs'

export type SubjectPreset = 'math' | 'literature' | 'general'
export type ConvertMode = 'ai' | 'offline'

export type PdfToWordResult = {
  markdown: string
  docxBytes: Uint8Array
  pageCount: number
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

/** Tách văn bản offline trực tiếp bằng pdf.js (giữ ngắt dòng/đoạn tốt cho tài liệu Văn thuần chữ). */
export async function extractMarkdownOffline(
  pdfBytes: Uint8Array,
  pages: number[],
  onProgress?: (label: string) => void,
): Promise<string> {
  const pdfjs = await loadPdfjs()
  const loadingTask = pdfjs.getDocument({ data: pdfBytes.slice() })
  const doc = await loadingTask.promise
  const pageBlocks: string[] = []

  try {
    for (let i = 0; i < pages.length; i += 1) {
      const pageNumber = pages[i]
      onProgress?.(`Đang tách chữ trang ${pageNumber} (${i + 1}/${pages.length})…`)
      const page = await doc.getPage(pageNumber)
      const content = await page.getTextContent()

      type Line = { y: number; height: number; items: Array<{ x: number; text: string }> }
      const lines: Line[] = []

      for (const rawItem of content.items) {
        if (!('str' in rawItem) || !rawItem.str) continue
        const x = rawItem.transform[4]
        const y = rawItem.transform[5]
        const height = Math.abs(rawItem.transform[3]) || rawItem.height || 12
        const existing = lines.find((line) => Math.abs(line.y - y) <= Math.max(3, height * 0.45))
        if (existing) {
          existing.items.push({ x, text: rawItem.str })
        } else {
          lines.push({ y, height, items: [{ x, text: rawItem.str }] })
        }
      }

      lines.sort((a, b) => b.y - a.y)
      const paragraphs: string[] = []
      let current = ''
      let prevY: number | null = null
      let prevHeight = 12

      for (const line of lines) {
        line.items.sort((a, b) => a.x - b.x)
        const text = line.items
          .map((item) => item.text)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
        if (!text) continue

        const gap = prevY !== null ? prevY - line.y : 0
        const startsNew =
          prevY === null ||
          gap > prevHeight * 1.65 ||
          /^(Câu|Bài|Phần|Chương|I+\.|[A-D]\.|[0-9]+[.)])\s/i.test(text)

        if (startsNew && current) {
          paragraphs.push(current)
          current = text
        } else {
          current = current ? `${current} ${text}` : text
        }
        prevY = line.y
        prevHeight = line.height
      }

      if (current) paragraphs.push(current)
      pageBlocks.push(paragraphs.join('\n\n') || `*(Trang ${pageNumber} không có lớp chữ — hãy dùng chế độ AI Toán–Văn để đọc bản scan)*`)
    }
  } finally {
    await loadingTask.destroy()
  }

  return pageBlocks.join('\n\n---\n\n')
}

export async function markdownToDocxBytes(markdown: string): Promise<Uint8Array> {
  const { default: markdownDocx, Packer } = await import('markdown-docx')
  const doc = await markdownDocx(markdown, {
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
  // Gửi từng lô 3 trang để tránh timeout và cập nhật tiến độ mượt cho người dùng
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

  const markdown = pageMarkdowns.join('\n\n')
  if (!markdown.trim()) throw new Error('Không đọc được nội dung từ trang đã chọn.')

  options.onProgress?.('Đang tạo file Word (.docx) với công thức chuẩn…')
  const docxBytes = await markdownToDocxBytes(markdown)
  return { markdown, docxBytes, pageCount: imagesBase64.length }
}

export async function convertOfflineToDocx(
  pdfBytes: Uint8Array,
  pages: number[],
  onProgress?: (label: string) => void,
): Promise<PdfToWordResult> {
  const markdown = await extractMarkdownOffline(pdfBytes, pages, onProgress)
  onProgress?.('Đang tạo file Word (.docx)…')
  const docxBytes = await markdownToDocxBytes(markdown)
  return { markdown, docxBytes, pageCount: pages.length }
}
