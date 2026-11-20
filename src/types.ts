export type TabKey = 'pdf' | 'word'

export type TaskStatus = 'idle' | 'running' | 'done' | 'error'

export type ThemePreference = 'system' | 'light' | 'dark'

export type ResolvedTheme = 'light' | 'dark'

export type PdfRow = {
  id: string
  fileId: string
  name: string
  pageCount: number
  from: number
  to: number
}

export type IncomingFiles = {
  files: File[]
  token: number
}
