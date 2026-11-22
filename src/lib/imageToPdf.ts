export type ImageItem = {
  id: string
  file: File
  url: string
  bytes: Uint8Array
  type: 'jpeg' | 'png'
  width: number
  height: number
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
      // Nếu là ảnh JPEG chụp từ điện thoại, vẽ lại qua canvas nếu cần giữ đúng chiều hiển thị EXIF
      // Với PNG/JPG thường, giữ nguyên bytes gốc để không mất chất lượng.
      const bytes = new Uint8Array(await file.arrayBuffer())
      return { bytes, type: isPng ? 'png' : 'jpeg', width, height }
    }

    // Ảnh WebP hoặc định dạng trình duyệt đọc được → chuyển sang JPEG chất lượng cao
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
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
