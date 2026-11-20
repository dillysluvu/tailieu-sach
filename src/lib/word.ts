import DOMPurify from 'dompurify'
import { extractRange, getPdfPageCount } from './pdf'

export type ConvertedWord = {
  bytes: Uint8Array
  pageCount: number
}

export async function convertDocxToPdf(file: File): Promise<ConvertedWord> {
  const [{ default: mammoth }, { default: html2pdf }] = await Promise.all([
    import('mammoth/mammoth.browser'),
    import('html2pdf.js'),
  ])

  const { value: rawHtml } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() })
  const html = DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } })

  const wrapper = document.createElement('div')
  wrapper.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;overflow:hidden;pointer-events:none;'

  const container = document.createElement('div')
  // Phải giữ position:static: html2pdf tính chiều cao = 0 nếu phần tử được position.
  container.style.cssText = [
    'width:210mm',
    'padding:12mm',
    'box-sizing:border-box',
    'background:#ffffff',
    'color:#000000',
    'font-family:Inter,Arial,sans-serif',
    'font-size:12pt',
    'line-height:1.5',
  ].join(';')
  container.innerHTML = html
  wrapper.appendChild(container)
  document.body.appendChild(wrapper)

  try {
    await document.fonts.ready
    const pdf = await html2pdf()
      .set({
        margin: [10, 10, 10, 10],
        filename: 'word.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(container)
      .toPdf()
      .get('pdf')

    const buffer = (pdf as { output: (type: string) => ArrayBuffer }).output('arraybuffer')
    const bytes = new Uint8Array(buffer)
    return { bytes, pageCount: await getPdfPageCount(bytes) }
  } finally {
    wrapper.remove()
  }
}

export async function cropWordPdf(bytes: Uint8Array, from: number, to: number): Promise<Uint8Array> {
  return extractRange(bytes, from, to)
}
