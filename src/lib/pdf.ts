import type { PDFDocument } from 'pdf-lib'
import type { PdfRow } from '../types'
import { pageIndices } from './parse'

export async function loadPdf(file: File): Promise<PDFDocument> {
  const { PDFDocument } = await import('pdf-lib')
  return PDFDocument.load(await file.arrayBuffer())
}

export async function getPdfPageCount(bytes: Uint8Array): Promise<number> {
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.load(bytes)
  return doc.getPageCount()
}

export async function mergeRows(rows: PdfRow[], cache: Map<string, PDFDocument>): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib')
  const output = await PDFDocument.create()

  for (const row of rows) {
    const source = cache.get(row.fileId)
    if (!source) throw new Error('Không tìm thấy file nguồn. Hãy kéo lại file.')
    const copied = await output.copyPages(source, pageIndices(row.from, row.to))
    copied.forEach((page) => output.addPage(page))
  }

  return output.save()
}

export async function extractRange(bytes: Uint8Array, from: number, to: number): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib')
  const source = await PDFDocument.load(bytes)
  const output = await PDFDocument.create()
  const copied = await output.copyPages(source, pageIndices(from, to))
  copied.forEach((page) => output.addPage(page))
  return output.save()
}
