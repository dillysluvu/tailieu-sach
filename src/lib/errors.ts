export const LIMITS = {
  maxFileBytes: 25 * 1024 * 1024,
  maxFilesPerDrop: 20,
  maxOutputPages: 1000,
} as const

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

export function isDocxFile(file: File): boolean {
  return (
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    file.name.toLowerCase().endsWith('.docx')
  )
}

export function friendlyError(error: unknown): string {
  if (!(error instanceof Error)) return 'Có lỗi xảy ra. Vui lòng thử lại.'
  const message = error.message.toLowerCase()
  if (message.includes('encrypt') || message.includes('password')) {
    return 'PDF được bảo vệ — hãy mở khóa trước.'
  }
  if (message.includes('invalid') || message.includes('no pdf') || message.includes('unexpected')) {
    return 'File PDF không hợp lệ hoặc đã bị hỏng.'
  }
  return error.message || 'Có lỗi xảy ra. Vui lòng thử lại.'
}
