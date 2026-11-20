export type ImageItem = {
  id: string
  file: File
  url: string
  bytes: Uint8Array
  type: 'jpeg' | 'png'
  width: number
  height: number
}

export async function readImage(file: File): Promise<ImageItem> {
  const { PDFDocument } = await import('pdf-lib')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const type = file.type === 'image/png' || /\.png$/i.test(file.name) ? 'png' : 'jpeg'
  const document = await PDFDocument.create()
  const image = type === 'png' ? await document.embedPng(bytes) : await document.embedJpg(bytes)
  return {
    id: crypto.randomUUID(),
    file,
    url: URL.createObjectURL(file),
    bytes,
    type,
    width: image.width,
    height: image.height,
  }
}

export async function imagesToPdf(items: ImageItem[]): Promise<Uint8Array> {
  if (!items.length) throw new Error('Hãy chọn ít nhất một ảnh.')
  const { PDFDocument } = await import('pdf-lib')
  const output = await PDFDocument.create()
  const margin = 28

  for (const item of items) {
    const image = item.type === 'png' ? await output.embedPng(item.bytes) : await output.embedJpg(item.bytes)
    const landscape = image.width >= image.height
    const page = output.addPage(landscape ? [842, 595] : [595, 842])
    const scale = Math.min(
      (page.getWidth() - margin * 2) / image.width,
      (page.getHeight() - margin * 2) / image.height,
    )
    const width = image.width * scale
    const height = image.height * scale
    page.drawImage(image, {
      x: (page.getWidth() - width) / 2,
      y: (page.getHeight() - height) / 2,
      width,
      height,
    })
  }

  return output.save()
}
