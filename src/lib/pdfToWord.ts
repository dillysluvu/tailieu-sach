type TextItemLike = {
  str: string
  transform: number[]
  width: number
  height: number
}

type Line = {
  text: string
}

function itemsToLines(items: TextItemLike[]): Line[] {
  const useful = items
    .filter((item) => item.str.trim().length > 0)
    .slice()
    .sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4])

  if (!useful.length) return []

  const groups: Array<{ y: number; items: TextItemLike[] }> = []
  for (const item of useful) {
    const y = item.transform[5]
    const tolerance = Math.max(2, item.height * 0.5)
    const group = groups.find((candidate) => Math.abs(candidate.y - y) <= tolerance)
    if (group) group.items.push(item)
    else groups.push({ y, items: [item] })
  }

  return groups
    .map((group) => {
      group.items.sort((a, b) => a.transform[4] - b.transform[4])
      let text = ''
      let previousRight = Number.NEGATIVE_INFINITY
      for (const item of group.items) {
        const x = item.transform[4]
        const gap = x - previousRight
        if (text && gap > Math.max(1.5, item.height * 0.35)) text += ' '
        text += item.str
        previousRight = x + item.width
      }
      return { text: text.replace(/\s+/g, ' ').trim() }
    })
    .filter((line) => line.text.length > 0)
}

export async function convertPdfToWord(bytes: Uint8Array, from = 1, to?: number): Promise<Uint8Array> {
  const [pdfjs, docx] = await Promise.all([import('pdfjs-dist'), import('docx')])

  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()

  const task = pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: true })
  const pdf = await task.promise

  try {
    const end = Math.min(to ?? pdf.numPages, pdf.numPages)
    const { Document, Packer, Paragraph, TextRun, PageBreak } = docx
    const paragraphs: InstanceType<typeof Paragraph>[] = []
    let extracted = 0

    for (let pageNumber = from; pageNumber <= end; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      const lines = itemsToLines(content.items as TextItemLike[])

      for (const line of lines) {
        paragraphs.push(
          new Paragraph({
            children: [new TextRun({ text: line.text, size: 22 })],
            spacing: { after: 120 },
          }),
        )
        extracted += line.text.length
      }

      if (pageNumber < end) {
        paragraphs.push(new Paragraph({ children: [new PageBreak()] }))
      }
    }

    if (!extracted) {
      throw new Error('PDF này không có văn bản để trích xuất — có thể là file scan (cần OCR).')
    }

    const document = new Document({ sections: [{ children: paragraphs }] })
    const blob = await Packer.toBlob(document)
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    await task.destroy()
  }
}
