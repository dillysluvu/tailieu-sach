export type ImagePdfQuality = 'original' | 'balanced' | 'compact'

export type ImageItem = {
  id: string
  file: File
  url: string
  bytes: Uint8Array
  type: 'jpeg' | 'png'
  width: number
  height: number
}

const IMAGE_QUALITY_PRESETS: Record<Exclude<ImagePdfQuality, 'original'>, { maxEdge: number; jpegQuality: number }> = {
  balanced: { maxEdge: 2200, jpegQuality: 0.8 },
  compact: { maxEdge: 1400, jpegQuality: 0.6 },
}

async function normalizeImage(file: File): Promise<{ bytes: Uint8Array; type: 'jpeg' | 'png'; width: number; height: number }> {
  const isPng = file.type === 'image/png' || /\.png$/i.test(file.name)
  const isJpeg = file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name)

  // Dùng createImageBitmap (tự tôn trọng EXIF orientation trên điện thoại) để lấy kích thước chuẩn
  // mà không cần tạo PDFDocument nháp tốn bộ nhớ.
  const bitmap = await createImageBitmap(file)
  try {
    const width = bitmap.width
    const height = bitmap.height

    if (isPng || isJpeg) {
      const bytes = new Uint8Array(await file.arrayBuffer())
      return { bytes, type: isPng ? 'png' : 'jpeg', width, height }
    }

    // Ảnh WebP hoặc định dạng trình duyệt đọc được → chuyển sang JPEG chất lượng cao
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    try {
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Không thể xử lý ảnh này trên trình duyệt.')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(bitmap, 0, 0)
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (result) => (result ? resolve(result) : reject(new Error('Không thể chuyển định dạng ảnh.'))),
          'image/jpeg',
          0.92,
        )
      })
      return {
        bytes: new Uint8Array(await blob.arrayBuffer()),
        type: 'jpeg',
        width,
        height,
      }
    } finally {
      canvas.width = 0
      canvas.height = 0
    }
  } finally {
    bitmap.close()
  }
}

async function recompressImageToJpeg(
  file: File,
  preset: { maxEdge: number; jpegQuality: number },
): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  try {
    const longest = Math.max(bitmap.width, bitmap.height)
    const ratio = longest > preset.maxEdge ? preset.maxEdge / longest : 1
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio))
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio))

    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Không thể nén ảnh trên trình duyệt.')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('Không thể nén định dạng ảnh.'))),
        'image/jpeg',
        preset.jpegQuality,
      )
    })
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    canvas.width = 0
    canvas.height = 0
    bitmap.close()
  }
}

export async function readImage(file: File): Promise<ImageItem> {
  const normalized = await normalizeImage(file)
  return {
    id: crypto.randomUUID(),
    file,
    url: URL.createObjectURL(file),
    ...normalized,
  }
}

export async function imagesToPdf(items: ImageItem[], quality: ImagePdfQuality = 'original'): Promise<Uint8Array> {
  if (!items.length) throw new Error('Hãy chọn ít nhất một ảnh.')
  const { PDFDocument } = await import('pdf-lib')
  const output = await PDFDocument.create()
  const margin = 28

  for (const item of items) {
    const image =
      quality === 'original'
        ? item.type === 'png'
          ? await output.embedPng(item.bytes)
          : await output.embedJpg(item.bytes)
        : await output.embedJpg(await recompressImageToJpeg(item.file, IMAGE_QUALITY_PRESETS[quality]))

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
