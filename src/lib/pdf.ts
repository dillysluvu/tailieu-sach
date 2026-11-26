import type { PDFDocument } from 'pdf-lib'
import type { PdfRow } from '../types'
import { pageIndices } from './parse'

export async function loadPdf(file: File): Promise<PDFDocument> {
  const { PDFDocument } = await import('pdf-lib')
  return PDFDocument.load(await file.arrayBuffer(), { throwOnInvalidObject: false })
}

export async function getPdfPageCount(bytes: Uint8Array): Promise<number> {
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.load(bytes, { throwOnInvalidObject: false })
  return doc.getPageCount()
}

export async function mergeRows(
  rows: PdfRow[],
  cache: Map<string, PDFDocument>,
  options?: { interleave?: boolean; reverseSecond?: boolean },
): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib')
  const output = await PDFDocument.create()

  if (options?.interleave && rows.length === 2) {
    const srcA = cache.get(rows[0].fileId)
    const srcB = cache.get(rows[1].fileId)
    if (!srcA || !srcB) throw new Error('Không tìm thấy file nguồn. Hãy kéo lại file.')

    const listA = pageIndices(rows[0].from, rows[0].to)
    const listB = pageIndices(rows[1].from, rows[1].to)
    if (options.reverseSecond) listB.reverse()

    const maxLen = Math.max(listA.length, listB.length)
    for (let i = 0; i < maxLen; i += 1) {
      if (i < listA.length) {
        const [pageA] = await output.copyPages(srcA, [listA[i]])
        output.addPage(pageA)
      }
      if (i < listB.length) {
        const [pageB] = await output.copyPages(srcB, [listB[i]])
        output.addPage(pageB)
      }
    }
    return output.save()
  }

  for (const row of rows) {
    const source = cache.get(row.fileId)
    if (!source) throw new Error('Không tìm thấy file nguồn. Hãy kéo lại file.')
    const copied = await output.copyPages(source, pageIndices(row.from, row.to))
    copied.forEach((page) => output.addPage(page))
  }

  return output.save()
}

export async function extractRange(bytes: Uint8Array, from: number, to: number): Promise<Uint8Array> {
  return extractPages(bytes, pageIndices(from, to))
}

export async function extractPages(bytes: Uint8Array, pages: number[]): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib')
  const source = await PDFDocument.load(bytes, { throwOnInvalidObject: false })
  const output = await PDFDocument.create()
  const copied = await output.copyPages(
    source,
    pages.map((page) => page - 1),
  )
  copied.forEach((page) => output.addPage(page))
  return output.save()
}
