import { injectMathPlaceholders, prepareDocxWithMath } from './omml'
import { extractRange } from './pdf'

export type ConvertedWord = {
  bytes: Uint8Array
  pageCount: number
  printHtml: string
}

const A4_PORTRAIT: [number, number] = [595.28, 841.89]
const A4_LANDSCAPE: [number, number] = [841.89, 595.28]

/** Quét ngược từ vị trí cắt lý tưởng để tìm dòng trắng sạch, tránh cắt đôi chữ/công thức. */
function findCleanBreakY(canvas: HTMLCanvasElement, idealY: number, minY: number): number {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx || idealY <= minY) return idealY

  const w = canvas.width
  const sampleStep = Math.max(1, Math.floor(w / 160))
  const startY = Math.min(canvas.height - 1, Math.max(minY, idealY))

  for (let y = startY; y >= minY; y -= 2) {
    const row = ctx.getImageData(0, y, w, 1).data
    let clean = true
    for (let x = 0; x < w; x += sampleStep) {
      const idx = x * 4
      if (row[idx] < 245 || row[idx + 1] < 245 || row[idx + 2] < 245) {
        clean = false
        break
      }
    }
    if (clean) return y
  }
  return idealY
}

function canvasToJpegBytes(canvas: HTMLCanvasElement, quality = 0.93): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Không thể dựng ảnh trang PDF từ file Word.'))
          return
        }
        void blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)), reject)
      },
      'image/jpeg',
      quality,
    )
  })
}

async function renderFallbackWithMammoth(docxBytes: Uint8Array, stageEl: HTMLElement, styleEl: HTMLElement): Promise<void> {
  const [{ default: mammoth }, { default: DOMPurify }] = await Promise.all([
    import('mammoth/mammoth.browser'),
    import('dompurify'),
  ])
  const buffer = new Uint8Array(docxBytes).buffer
  const { value: rawHtml } = await mammoth.convertToHtml({ arrayBuffer: buffer })
  const safeHtml = DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } })

  styleEl.innerHTML = `<style>
    .docx-fallback { width: 210mm; min-height: 297mm; padding: 18mm 18mm; box-sizing: border-box; background: #fff; color: #000; font-family: "Times New Roman", "Liberation Serif", Inter, serif; font-size: 13pt; line-height: 1.45; }
    .docx-fallback table { width: 100%; border-collapse: collapse; margin: 8px 0; }
    .docx-fallback td, .docx-fallback th { border: 1px solid #333; padding: 4px 6px; vertical-align: top; }
    .docx-fallback p { margin: 0 0 8px; }
    .docx-fallback img { max-width: 100%; height: auto; }
  </style>`
  stageEl.innerHTML = `<section class="docx docx-fallback">${safeHtml}</section>`
}

export async function convertDocxToPdf(
  file: File,
  onProgress?: (label: string) => void,
): Promise<ConvertedWord> {
  onProgress?.('Đang đọc bố cục & công thức Word…')
  const { docxBytes, mathHtmlMap } = prepareDocxWithMath(await file.arrayBuffer())

  const [{ renderAsync }, { default: html2canvas }, { PDFDocument }] = await Promise.all([
    import('docx-preview'),
    import('html2canvas'),
    import('pdf-lib'),
  ])

  const wrapper = document.createElement('div')
  wrapper.style.cssText =
    'position:fixed;left:-12000px;top:0;width:1000px;background:#ffffff;color:#000000;pointer-events:none;z-index:-1;'

  const styleEl = document.createElement('div')
  const stageEl = document.createElement('div')
  wrapper.appendChild(styleEl)
  wrapper.appendChild(stageEl)
  document.body.appendChild(wrapper)

  try {
    try {
      await renderAsync(docxBytes, stageEl, styleEl, {
        className: 'docx',
        inWrapper: false,
        breakPages: true,
        ignoreLastRenderedPageBreak: false,
        experimental: true,
        useBase64URL: true,
        renderHeaders: true,
        renderFooters: true,
        renderFootnotes: true,
        renderEndnotes: true,
      })
    } catch {
      await renderFallbackWithMammoth(docxBytes, stageEl, styleEl)
    }

    const extraCss = document.createElement('style')
    extraCss.textContent = `
      section.docx { box-shadow: none !important; margin: 0 auto !important; background: #ffffff !important; color: #000000; }
      section.docx img { max-width: 100%; height: auto; }
      .docx-omml { font-family: "Cambria Math", "Times New Roman", serif; }
    `
    styleEl.appendChild(extraCss)

    injectMathPlaceholders(stageEl, mathHtmlMap)
    await document.fonts.ready

    const printHtml = `${styleEl.innerHTML}\n${stageEl.innerHTML}`

    const sections = Array.from(stageEl.querySelectorAll<HTMLElement>('section.docx'))
    const targets = sections.length ? sections : [stageEl]

    const pdfDoc = await PDFDocument.create()

    for (let i = 0; i < targets.length; i += 1) {
      const section = targets[i]
      onProgress?.(`Đang dựng trang PDF ${i + 1}/${targets.length}…`)

      const isLandscape = section.offsetWidth > section.offsetHeight * 1.05
      const [pageW, pageH] = isLandscape ? A4_LANDSCAPE : A4_PORTRAIT

      const canvas = await html2canvas(section, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      })

      try {
        const sliceHeight = Math.max(100, Math.round(canvas.width * (pageH / pageW)))
        if (canvas.height <= sliceHeight * 1.05) {
          const jpgBytes = await canvasToJpegBytes(canvas, 0.93)
          const jpgImage = await pdfDoc.embedJpg(jpgBytes)
          const page = pdfDoc.addPage([pageW, pageH])
          const drawScale = Math.min(pageW / jpgImage.width, pageH / jpgImage.height)
          const drawW = jpgImage.width * drawScale
          const drawH = jpgImage.height * drawScale
          page.drawImage(jpgImage, {
            x: (pageW - drawW) / 2,
            y: pageH - drawH,
            width: drawW,
            height: drawH,
          })
        } else {
          let cursorY = 0
          const sliceCanvas = document.createElement('canvas')
          sliceCanvas.width = canvas.width
          sliceCanvas.height = sliceHeight
          const sctx = sliceCanvas.getContext('2d')
          if (!sctx) throw new Error('Không thể khởi tạo canvas cắt trang.')

          while (cursorY < canvas.height - 8) {
            const idealEnd = Math.min(canvas.height, cursorY + sliceHeight)
            const breakY =
              idealEnd < canvas.height
                ? findCleanBreakY(canvas, idealEnd, Math.max(cursorY + Math.round(sliceHeight * 0.72), cursorY + 40))
                : canvas.height
            const chunkH = Math.max(1, breakY - cursorY)

            sctx.fillStyle = '#ffffff'
            sctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height)
            sctx.drawImage(canvas, 0, cursorY, canvas.width, chunkH, 0, 0, canvas.width, chunkH)

            const jpgBytes = await canvasToJpegBytes(sliceCanvas, 0.93)
            const jpgImage = await pdfDoc.embedJpg(jpgBytes)
            const page = pdfDoc.addPage([pageW, pageH])
            page.drawImage(jpgImage, { x: 0, y: 0, width: pageW, height: pageH })

            cursorY = breakY
          }
          sliceCanvas.width = 0
          sliceCanvas.height = 0
        }
      } finally {
        canvas.width = 0
        canvas.height = 0
      }
    }

    const bytes = await pdfDoc.save()
    return {
      bytes,
      pageCount: pdfDoc.getPageCount(),
      printHtml,
    }
  } finally {
    wrapper.remove()
  }
}

/** Mở hộp thoại In / Lưu thành PDF Vector của trình duyệt (giữ 100% lớp chữ & chọn được text). */
export function printWordAsVectorPdf(printHtml: string, title = 'Tai-lieu-PDF'): void {
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;'
  document.body.appendChild(iframe)

  const doc = iframe.contentDocument
  const win = iframe.contentWindow
  if (!doc || !win) {
    iframe.remove()
    throw new Error('Trình duyệt không cho phép mở khung in.')
  }

  doc.open()
  doc.write(`<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<title>${title.replace(/[<>&"]/g, '')}</title>
<style>
  @page { size: A4; margin: 0; }
  html, body { margin: 0; padding: 0; background: #ffffff; color: #000000; }
  section.docx { margin: 0 auto !important; box-shadow: none !important; break-after: page; page-break-after: always; }
  section.docx:last-child { break-after: auto; page-break-after: auto; }
</style>
</head>
<body>${printHtml}</body>
</html>`)
  doc.close()

  const cleanup = () => {
    window.setTimeout(() => iframe.remove(), 500)
  }

  win.addEventListener('afterprint', cleanup, { once: true })
  window.setTimeout(() => {
    try {
      win.focus()
      win.print()
    } finally {
      window.setTimeout(cleanup, 60_000)
    }
  }, 250)
}

export async function cropWordPdf(bytes: Uint8Array, from: number, to: number): Promise<Uint8Array> {
  return extractRange(bytes, from, to)
}
