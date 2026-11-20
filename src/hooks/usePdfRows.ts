import { useCallback, useRef, useState } from 'react'
import type { PDFDocument } from 'pdf-lib'
import { isPdfFile, LIMITS, sizeError } from '../lib/errors'
import { loadPdf } from '../lib/pdf'
import type { PdfRow } from '../types'

export function usePdfRows() {
  const [rows, setRows] = useState<PdfRow[]>([])
  const [loading, setLoading] = useState(false)
  const cache = useRef(new Map<string, PDFDocument>())
  const sequence = useRef(0)

  const addFiles = useCallback(async (files: File[]) => {
    const pdfs = files.filter(isPdfFile)
    if (!pdfs.length) return
    if (pdfs.length > LIMITS.maxFilesPerDrop) {
      throw new Error(`Tối đa ${LIMITS.maxFilesPerDrop} file mỗi lần.`)
    }
    const oversized = pdfs.find((file) => file.size > LIMITS.maxFileBytes)
    if (oversized) throw new Error(sizeError(oversized))

    setLoading(true)
    try {
      const added: PdfRow[] = []
      for (const file of pdfs) {
        const document = await loadPdf(file)
        const fileId = `file-${++sequence.current}`
        cache.current.set(fileId, document)
        const pageCount = document.getPageCount()
        if (pageCount === 0) throw new Error(`"${file.name}" không có trang nào.`)
        added.push({
          id: crypto.randomUUID(),
          fileId,
          name: file.name,
          pageCount,
          from: 1,
          to: pageCount,
        })
      }
      setRows((previous) => [...previous, ...added])
    } finally {
      setLoading(false)
    }
  }, [])

  const updateRow = useCallback((id: string, patch: Partial<Pick<PdfRow, 'from' | 'to'>>) => {
    setRows((previous) => previous.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }, [])

  const duplicateRow = useCallback((id: string) => {
    setRows((previous) => {
      const index = previous.findIndex((row) => row.id === id)
      if (index < 0) return previous
      const copy = { ...previous[index], id: crypto.randomUUID() }
      return [...previous.slice(0, index + 1), copy, ...previous.slice(index + 1)]
    })
  }, [])

  const removeRow = useCallback((id: string) => {
    const target = rows.find((row) => row.id === id)
    setRows((previous) => previous.filter((row) => row.id !== id))
    if (target && !rows.some((row) => row.id !== id && row.fileId === target.fileId)) {
      cache.current.delete(target.fileId)
    }
  }, [rows])

  const moveRow = useCallback((id: string, direction: -1 | 1) => {
    setRows((previous) => {
      const index = previous.findIndex((row) => row.id === id)
      const target = index + direction
      if (index < 0 || target < 0 || target >= previous.length) return previous
      const next = [...previous]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }, [])

  const reorderRow = useCallback((sourceId: string, targetId: string) => {
    if (sourceId === targetId) return
    setRows((previous) => {
      const from = previous.findIndex((row) => row.id === sourceId)
      const to = previous.findIndex((row) => row.id === targetId)
      if (from < 0 || to < 0) return previous
      const next = [...previous]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }, [])

  const getCache = useCallback(() => cache.current, [])

  return {
    rows,
    loading,
    addFiles,
    updateRow,
    duplicateRow,
    removeRow,
    moveRow,
    reorderRow,
    getCache,
  }
}
