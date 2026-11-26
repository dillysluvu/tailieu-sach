import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAsyncTask } from '../hooks/useAsyncTask'
import type { ExportRef } from '../hooks/useExportShortcut'
import { downloadBytes } from '../lib/download'
import {
  addPageNumbersToPdf,
  addWatermarkToPdf,
  applyOrganizePlan,
  cleanPdfMetadata,
  createNupPdf,
  cropPdfMargins,
  detectBlankPages,
  readPdfMetadata,
  removePagesFromPdf,
  renderPageThumbnails,
  rotatePdf,
  standardizePageSize,
  type BlankPageMatch,
  type OrganizePageSpec,
  type PageNumberFormat,
  type PageNumberPosition,
  type PdfMetadataInfo,
} from '../lib/editPdf'
import { isPdfFile, LIMITS, sizeError } from '../lib/errors'
import { outputName } from '../lib/exportOptions'
import { parsePageSelection } from '../lib/pageRange'
import { getPdfPageCount } from '../lib/pdf'
import type { IncomingFiles } from '../types'
import { Dropzone } from './Dropzone'
import { PdfPreviewModal } from './PdfPreviewModal'
import { StickyActionBar } from './StickyActionBar'
import { StatusLine } from './StatusLine'

type Props = {
  incoming: IncomingFiles
  onFiles: (files: File[]) => void
  active: boolean
  exportRef: ExportRef
}

type EditTool =
  | 'rotate'
  | 'organize'
  | 'numbers'
  | 'watermark'
  | 'blank'
  | 'nup'
  | 'pagesize'
  | 'crop'
  | 'metadata'

const TOOLS: Array<{ value: EditTool; label: string }> = [
  { value: 'rotate', label: 'Xoay trang' },
  { value: 'organize', label: 'Sắp xếp & Xóa' },
  { value: 'numbers', label: 'Đánh số trang' },
  { value: 'watermark', label: 'Đóng dấu mờ' },
  { value: 'blank', label: 'Xóa trang trắng' },
  { value: 'nup', label: 'In gộp trang' },
  { value: 'pagesize', label: 'Chuẩn hóa A4/A5' },
  { value: 'crop', label: 'Cắt lề' },
  { value: 'metadata', label: 'Thông tin ẩn' },
]

const POSITIONS: Array<{ value: PageNumberPosition; label: string }> = [
  { value: 'top-left', label: 'Trên trái' },
  { value: 'top-center', label: 'Trên giữa' },
  { value: 'top-right', label: 'Trên phải' },
  { value: 'bottom-left', label: 'Dưới trái' },
  { value: 'bottom-center', label: 'Dưới giữa' },
  { value: 'bottom-right', label: 'Dưới phải' },
]

const WATERMARK_COLORS = [
  { hex: '#6b7280', label: 'Xám' },
  { hex: '#dc2626', label: 'Đỏ' },
  { hex: '#2563eb', label: 'Xanh' },
]

const CROP_PRESETS = [
  { label: 'Viền scan 8 mm', value: '8' },
  { label: 'Lề vừa 15 mm', value: '15' },
  { label: 'Lề rộng 22 mm', value: '22' },
]

function buildInitialPlan(count: number): OrganizePageSpec[] {
  return Array.from({ length: count }, (_, idx) => ({
    kind: 'source',
    id: `src-${idx}-${crypto.randomUUID()}`,
    sourceIndex: idx,
    rotation: 0,
  }))
}

export function EditPdfPanel({ incoming, onFiles, active, exportRef }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [bytes, setBytes] = useState<Uint8Array | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [tool, setTool] = useState<EditTool>('rotate')
  const [filename, setFilename] = useState('')

  // Rotate state
  const [rotateAngle, setRotateAngle] = useState<90 | 180 | 270>(90)
  const [rotateRange, setRotateRange] = useState('')

  // Organize state
  const [organizePlan, setOrganizePlan] = useState<OrganizePageSpec[]>([])
  const [organizeThumbs, setOrganizeThumbs] = useState<string[]>([])
  const [organizeLoading, setOrganizeLoading] = useState(false)
  const organizeUrlsRef = useRef<string[]>([])
  const organizeGenRef = useRef(0)

  // Page numbers state
  const [numPosition, setNumPosition] = useState<PageNumberPosition>('bottom-center')
  const [numFormat, setNumFormat] = useState<PageNumberFormat>('trang-x-of-y')
  const [numSize, setNumSize] = useState<10 | 12 | 14>(12)
  const [startNumber, setStartNumber] = useState(1)

  // Watermark state
  const [wmText, setWmText] = useState('TÀI LIỆU THAM KHẢO')
  const [wmAngle, setWmAngle] = useState<-45 | 0 | 45>(-45)
  const [wmOpacity, setWmOpacity] = useState<0.15 | 0.25 | 0.4>(0.25)
  const [wmTile, setWmTile] = useState(false)
  const [wmColor, setWmColor] = useState('#6b7280')
  const [wmRange, setWmRange] = useState('')

  // Blank page removal state
  const [sensitivity, setSensitivity] = useState<60 | 80 | 92>(80)
  const [blankScanned, setBlankScanned] = useState(false)
  const [blankMatches, setBlankMatches] = useState<BlankPageMatch[]>([])
  const [selectedBlanks, setSelectedBlanks] = useState<number[]>([])
  const thumbUrlsRef = useRef<string[]>([])

  // N-up state
  const [nupSheets, setNupSheets] = useState<2 | 4>(2)

  // Standardize page size state
  const [stdSize, setStdSize] = useState<'A4' | 'A5'>('A4')
  const [stdOrient, setStdOrient] = useState<'auto' | 'portrait' | 'landscape'>('auto')
  const [stdMode, setStdMode] = useState<'fit' | 'fill'>('fit')

  // Crop margins state
  const [cropTop, setCropTop] = useState('8')
  const [cropBottom, setCropBottom] = useState('8')
  const [cropLeft, setCropLeft] = useState('8')
  const [cropRight, setCropRight] = useState('8')
  const [cropRange, setCropRange] = useState('')

  // Metadata state
  const [metadataInfo, setMetadataInfo] = useState<PdfMetadataInfo | null>(null)

  // Preview state
  const [previewBytes, setPreviewBytes] = useState<Uint8Array | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  const lastToken = useRef(0)
  const { status, message, run, reset, setMessage } = useAsyncTask()

  const clearBlankThumbnails = useCallback(() => {
    thumbUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    thumbUrlsRef.current = []
    setBlankMatches([])
    setSelectedBlanks([])
    setBlankScanned(false)
  }, [])

  const clearOrganizeThumbnails = useCallback(() => {
    organizeGenRef.current += 1
    organizeUrlsRef.current.forEach((url) => {
      if (url) URL.revokeObjectURL(url)
    })
    organizeUrlsRef.current = []
    setOrganizeThumbs([])
    setOrganizeLoading(false)
  }, [])

  useEffect(() => {
    return () => {
      clearBlankThumbnails()
      clearOrganizeThumbnails()
    }
  }, [clearBlankThumbnails, clearOrganizeThumbnails])

  const loadOrganizeThumbnails = useCallback(
    (pdfBytes: Uint8Array) => {
      const gen = ++organizeGenRef.current
      setOrganizeLoading(true)
      void renderPageThumbnails(pdfBytes)
        .then((urls) => {
          if (gen !== organizeGenRef.current) {
            urls.forEach((url) => {
              if (url) URL.revokeObjectURL(url)
            })
            return
          }
          organizeUrlsRef.current = urls
          setOrganizeThumbs(urls)
        })
        .catch(() => {
          /* giữ giao diện sắp xếp dạng thẻ chữ nếu thiết bị không dựng được thumbnail */
        })
        .finally(() => {
          if (gen === organizeGenRef.current) setOrganizeLoading(false)
        })
    },
    [],
  )

  const acceptFiles = useCallback(
    async (files: File[]) => {
      const pdfs = files.filter(isPdfFile)
      if (!pdfs.length) throw new Error('Hãy chọn một file PDF để chỉnh sửa.')
      if (pdfs.length > 1) throw new Error('Chọn một file PDF mỗi lần.')
      if (pdfs[0].size > LIMITS.maxFileBytes) throw new Error(sizeError(pdfs[0]))

      const raw = new Uint8Array(await pdfs[0].arrayBuffer())
      const count = await getPdfPageCount(raw)
      if (count === 0) throw new Error(`"${pdfs[0].name}" không có trang nào.`)

      clearBlankThumbnails()
      clearOrganizeThumbnails()
      setFile(pdfs[0])
      setBytes(raw)
      setPageCount(count)
      setOrganizePlan(buildInitialPlan(count))
      setFilename(`${pdfs[0].name.replace(/\.pdf$/i, '')}-sua`)
      setRotateRange('')
      setWmRange('')
      setCropRange('')
      setPreviewBytes(null)
      setPreviewOpen(false)
      if (tool === 'organize') {
        loadOrganizeThumbnails(raw)
      }
      void readPdfMetadata(raw)
        .then(setMetadataInfo)
        .catch(() => setMetadataInfo(null))
    },
    [clearBlankThumbnails, clearOrganizeThumbnails, loadOrganizeThumbnails, tool],
  )

  useEffect(() => {
    if (incoming.target === 'edit' && incoming.token > lastToken.current && incoming.files.length) {
      lastToken.current = incoming.token
      void run(() => acceptFiles(incoming.files), 'Đã nạp file PDF. Chọn công cụ bên dưới.')
    }
  }, [incoming, acceptFiles, run])

  const selectTool = (nextTool: EditTool) => {
    setTool(nextTool)
    if (nextTool === 'organize' && bytes && organizeThumbs.length === 0 && !organizeLoading) {
      loadOrganizeThumbnails(bytes)
    }
  }

  const rangeCheck = useMemo(() => {
    if (!pageCount) return { pages: undefined as number[] | undefined, error: null as string | null }
    const activeInput =
      tool === 'rotate' ? rotateRange : tool === 'watermark' ? wmRange : tool === 'crop' ? cropRange : ''
    if (!activeInput.trim()) return { pages: undefined, error: null }
    const parsed = parsePageSelection(activeInput, pageCount)
    return { pages: parsed.pages, error: parsed.error }
  }, [cropRange, pageCount, rotateRange, tool, wmRange])

  const cropNumbers = useMemo(() => {
    const parseVal = (raw: string) => Number(raw.replace(',', '.'))
    const top = parseVal(cropTop)
    const bottom = parseVal(cropBottom)
    const left = parseVal(cropLeft)
    const right = parseVal(cropRight)
    const invalid = [top, bottom, left, right].some((v) => !Number.isFinite(v) || v < 0)
    return { top, bottom, left, right, error: invalid ? 'Nhập số mm hợp lệ (từ 0 trở lên).' : null }
  }, [cropBottom, cropLeft, cropRight, cropTop])

  const busy = status === 'running'
  const outName = outputName(filename, file?.name.replace(/\.pdf$/i, '') ? `${file.name.replace(/\.pdf$/i, '')}-sua` : 'tai-lieu-da-sua')

  const buildEditedPdf = useCallback(async (): Promise<Uint8Array> => {
    if (!bytes) throw new Error('Hãy chọn file PDF trước.')
    if (rangeCheck.error) throw new Error(rangeCheck.error)

    if (tool === 'rotate') {
      setMessage('Đang xoay trang PDF…')
      return rotatePdf(bytes, rotateAngle, rangeCheck.pages)
    }
    if (tool === 'organize') {
      if (!organizePlan.length) throw new Error('Cần giữ lại ít nhất 1 trang để xuất PDF.')
      setMessage('Đang sắp xếp và đóng gói trang PDF…')
      return applyOrganizePlan(bytes, organizePlan)
    }
    if (tool === 'numbers') {
      if (!Number.isInteger(startNumber) || startNumber < 1) {
        throw new Error('Số bắt đầu phải từ 1 trở lên.')
      }
      setMessage('Đang đánh số trang…')
      return addPageNumbersToPdf(bytes, {
        position: numPosition,
        format: numFormat,
        fontSize: numSize,
        startNumber,
      })
    }
    if (tool === 'watermark') {
      if (!wmText.trim()) throw new Error('Hãy nhập nội dung dấu mờ.')
      setMessage('Đang đóng dấu mờ lên tài liệu…')
      return addWatermarkToPdf(bytes, {
        text: wmText,
        fontSize: 36,
        opacity: wmOpacity,
        angle: wmAngle,
        colorHex: wmColor,
        tile: wmTile,
        targetPages: rangeCheck.pages,
      })
    }
    if (tool === 'blank') {
      if (!selectedBlanks.length) {
        throw new Error('Hãy quét và chọn ít nhất 1 trang trắng để xóa.')
      }
      setMessage(`Đang xóa ${selectedBlanks.length} trang trắng…`)
      return removePagesFromPdf(bytes, selectedBlanks)
    }
    if (tool === 'nup') {
      return createNupPdf(bytes, nupSheets, (done, total) => {
        setMessage(`Đang xếp tờ A4 ${done} / ${total}…`)
      })
    }
    if (tool === 'pagesize') {
      return standardizePageSize(
        bytes,
        { size: stdSize, orientation: stdOrient, mode: stdMode },
        (done, total) => setMessage(`Đang chuẩn hóa trang ${done} / ${total}…`),
      )
    }
    if (tool === 'crop') {
      if (cropNumbers.error) throw new Error(cropNumbers.error)
      setMessage('Đang cắt lề các trang PDF…')
      return cropPdfMargins(
        bytes,
        {
          top: cropNumbers.top,
          bottom: cropNumbers.bottom,
          left: cropNumbers.left,
          right: cropNumbers.right,
        },
        rangeCheck.pages,
      )
    }

    setMessage('Đang xóa thông tin ẩn của file PDF…')
    return cleanPdfMetadata(bytes)
  }, [
    bytes,
    cropNumbers,
    numFormat,
    numPosition,
    numSize,
    nupSheets,
    organizePlan,
    rangeCheck.error,
    rangeCheck.pages,
    rotateAngle,
    selectedBlanks,
    setMessage,
    startNumber,
    stdMode,
    stdOrient,
    stdSize,
    tool,
    wmAngle,
    wmColor,
    wmOpacity,
    wmText,
    wmTile,
  ])

  const handleScanBlank = () => {
    if (!bytes) return
    void run(async () => {
      clearBlankThumbnails()
      const found = await detectBlankPages(bytes, sensitivity, (done, total) => {
        setMessage(`Đang kiểm tra trang ${done} / ${total}…`)
      })
      thumbUrlsRef.current = found.map((m) => m.thumbnailUrl).filter(Boolean)
      setBlankMatches(found)
      setSelectedBlanks(found.map((m) => m.pageNumber))
      setBlankScanned(true)
    }, 'Đã quét xong trang trắng.')
  }

  const toggleBlankPage = (pageNum: number) => {
    setSelectedBlanks((prev) =>
      prev.includes(pageNum) ? prev.filter((p) => p !== pageNum) : [...prev, pageNum].sort((a, b) => a - b),
    )
  }

  const moveOrganizeItem = (index: number, delta: -1 | 1) => {
    const target = index + delta
    if (target < 0 || target >= organizePlan.length) return
    setOrganizePlan((prev) => {
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const rotateOrganizeItem = (index: number) => {
    setOrganizePlan((prev) =>
      prev.map((item, i) => {
        if (i !== index || item.kind !== 'source') return item
        const nextRot = ((item.rotation + 90) % 360) as 0 | 90 | 180 | 270
        return { ...item, rotation: nextRot }
      }),
    )
  }

  const removeOrganizeItem = (index: number) => {
    setOrganizePlan((prev) => prev.filter((_, i) => i !== index))
  }

  const handleExport = useCallback(() => {
    void run(async () => {
      const outBytes = await buildEditedPdf()
      setPreviewBytes(outBytes)
      if (tool === 'metadata') {
        setMetadataInfo({ title: '', author: '', subject: '', creator: '', producer: '', keywords: '' })
      }
      downloadBytes(outBytes, outName)
    }, 'Đã xuất file PDF thành công.')
  }, [buildEditedPdf, outName, run, tool])

  const handlePreview = useCallback(() => {
    void run(async () => {
      const outBytes = await buildEditedPdf()
      setPreviewBytes(outBytes)
      setPreviewOpen(true)
    }, 'Đã dựng xong bản xem trước.')
  }, [buildEditedPdf, run])

  useEffect(() => {
    if (!active) return
    exportRef.current = handleExport
    return () => {
      if (exportRef.current === handleExport) exportRef.current = null
    }
  }, [active, exportRef, handleExport])

  const clear = () => {
    reset()
    clearBlankThumbnails()
    clearOrganizeThumbnails()
    setFile(null)
    setBytes(null)
    setPageCount(0)
    setOrganizePlan([])
    setMetadataInfo(null)
    setPreviewBytes(null)
    setPreviewOpen(false)
  }

  const actionDisabled =
    !!rangeCheck.error ||
    (tool === 'watermark' && !wmText.trim()) ||
    (tool === 'blank' && selectedBlanks.length === 0) ||
    (tool === 'organize' && organizePlan.length === 0) ||
    (tool === 'crop' && !!cropNumbers.error)

  const actionLabel =
    tool === 'rotate'
      ? 'Xoay & Tải PDF'
      : tool === 'organize'
        ? `Xuất ${organizePlan.length} trang`
        : tool === 'numbers'
          ? 'Đánh số & Tải PDF'
          : tool === 'watermark'
            ? 'Đóng dấu & Tải PDF'
            : tool === 'blank'
              ? `Xóa ${selectedBlanks.length} trang trắng`
              : tool === 'nup'
                ? `In gộp ${nupSheets} trang / tờ`
                : tool === 'pagesize'
                  ? `Chuẩn hóa ${stdSize} & Tải`
                  : tool === 'crop'
                    ? 'Cắt lề & Tải PDF'
                    : 'Xóa thông tin ẩn & Tải PDF'

  const metadataEntries = metadataInfo
    ? ([
        ['Tiêu đề', metadataInfo.title],
        ['Tác giả', metadataInfo.author],
        ['Chủ đề', metadataInfo.subject],
        ['Phần mềm soạn', metadataInfo.creator],
        ['Trình xuất PDF', metadataInfo.producer],
        ['Từ khóa', metadataInfo.keywords],
      ] as const).filter(([, val]) => val.trim().length > 0)
    : []

  return (
    <section>
      <h2 className="sr-only">Chỉnh trang PDF: xoay, sắp xếp, đánh số, đóng dấu mờ, xóa trang trắng, in gộp, chuẩn hóa A4, cắt lề, xóa metadata</h2>

      <Dropzone
        accept=".pdf,application/pdf"
        multiple={false}
        title="Kéo file PDF cần chỉnh trang vào đây"
        hint="hoặc bấm để chọn · xoay, sắp xếp/xóa trang, đánh số, dấu mờ, in gộp, chuẩn hóa A4, cắt lề"
        onFiles={onFiles}
        busy={busy}
        compact={Boolean(file)}
      />

      {file && bytes && (
        <>
          <div className="mt-6 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <span className="mt-0.5 shrink-0 rounded bg-accent-soft px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.08em] text-accent">
                PDF
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium tracking-[-0.01em] text-text" title={file.name}>
                  {file.name}
                </p>
                <p className="mt-0.5 text-[11px] tabular text-muted">{pageCount} trang</p>
              </div>
            </div>
            <button type="button" onClick={clear} className="btn-ghost -mr-2">
              Chọn file khác
            </button>
          </div>

          <div className="mt-5 space-y-5">
            <div>
              <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Chọn thao tác</p>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Công cụ chỉnh trang PDF">
                {TOOLS.map((item) => {
                  const selected = tool === item.value
                  return (
                    <button
                      key={item.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => selectTool(item.value)}
                      className={`min-h-11 rounded-control border px-3 text-[12px] transition-colors duration-150 ${
                        selected
                          ? 'border-accent bg-accent-soft font-semibold text-accent'
                          : 'border-line bg-surface text-muted hover:border-line-strong hover:text-text'
                      }`}
                    >
                      {item.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {tool === 'rotate' && (
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Góc xoay</p>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        { angle: 90, label: '90° phải' },
                        { angle: 180, label: '180° lật ngược' },
                        { angle: 270, label: '90° trái' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.angle}
                        type="button"
                        aria-pressed={rotateAngle === opt.angle}
                        onClick={() => setRotateAngle(opt.angle)}
                        className={`min-h-11 rounded-control border px-3 text-[12px] transition-colors duration-150 ${
                          rotateAngle === opt.angle
                            ? 'border-accent bg-accent-soft font-semibold text-accent'
                            : 'border-line bg-surface text-muted hover:border-line-strong hover:text-text'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-faint">
                    Trang áp dụng (tùy chọn)
                  </span>
                  <input
                    type="text"
                    value={rotateRange}
                    onChange={(event) => setRotateRange(event.target.value)}
                    placeholder="Để trống = tất cả · vd: 1-3, lẻ, cuối"
                    spellCheck={false}
                    className="h-11 w-full rounded-control border border-line bg-surface px-3 text-base text-text outline-none placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent-soft sm:text-[13px]"
                  />
                </label>
              </div>
            )}

            {tool === 'organize' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOrganizePlan((prev) => [...prev].reverse())}
                    className="min-h-11 rounded-control border border-line bg-surface px-3 text-[12px] text-text transition-colors hover:border-line-strong hover:bg-surface-hover"
                  >
                    Đảo ngược thứ tự
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setOrganizePlan((prev) => [...prev, { kind: 'blank', id: `blank-${crypto.randomUUID()}` }])
                    }
                    className="min-h-11 rounded-control border border-line bg-surface px-3 text-[12px] text-text transition-colors hover:border-line-strong hover:bg-surface-hover"
                  >
                    + Chèn trang trắng
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrganizePlan(buildInitialPlan(pageCount))}
                    className="btn-ghost"
                  >
                    Khôi phục gốc
                  </button>
                </div>

                {organizeLoading && (
                  <p className="text-xs text-muted">Đang dựng ảnh thu nhỏ từng trang…</p>
                )}

                {organizePlan.length === 0 ? (
                  <p className="rounded-card border border-line bg-surface px-3.5 py-3 text-xs text-danger">
                    Bạn đã xóa hết mọi trang — hãy bấm &quot;Khôi phục gốc&quot; hoặc chèn trang trắng.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {organizePlan.map((item, idx) => {
                      const thumbUrl = item.kind === 'source' ? organizeThumbs[item.sourceIndex] : ''
                      const rotation = item.kind === 'source' ? item.rotation : 0
                      return (
                        <div
                          key={item.id}
                          className="flex flex-col justify-between rounded-card border border-line bg-surface p-2"
                        >
                          <div>
                            <div className="mb-1.5 flex items-center justify-between text-[11px] tabular">
                              <span className="font-semibold text-text">#{idx + 1}</span>
                              <span className="text-muted">
                                {item.kind === 'blank' ? 'Trang trắng' : `Gốc tr.${item.sourceIndex + 1}`}
                              </span>
                            </div>
                            <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded border border-line/60 bg-bg">
                              {item.kind === 'blank' ? (
                                <span className="text-[11px] text-faint">Trống</span>
                              ) : thumbUrl ? (
                                <img
                                  src={thumbUrl}
                                  alt={`Trang ${item.sourceIndex + 1}`}
                                  style={{ transform: `rotate(${rotation}deg)` }}
                                  className="max-h-full max-w-full object-contain transition-transform duration-150"
                                />
                              ) : (
                                <span className="text-xs tabular text-muted">Trang {item.sourceIndex + 1}</span>
                              )}
                            </div>
                          </div>

                          <div className="mt-2 grid grid-cols-2 gap-1">
                            <button
                              type="button"
                              aria-label="Đưa trang lên trước"
                              disabled={idx === 0}
                              onClick={() => moveOrganizeItem(idx, -1)}
                              className="btn-ghost h-11 w-full justify-center border border-line px-0"
                            >
                              ←
                            </button>
                            <button
                              type="button"
                              aria-label="Đưa trang ra sau"
                              disabled={idx === organizePlan.length - 1}
                              onClick={() => moveOrganizeItem(idx, 1)}
                              className="btn-ghost h-11 w-full justify-center border border-line px-0"
                            >
                              →
                            </button>
                            <button
                              type="button"
                              aria-label="Xoay trang này 90 độ"
                              disabled={item.kind === 'blank'}
                              onClick={() => rotateOrganizeItem(idx)}
                              className="btn-ghost h-11 w-full justify-center border border-line px-0"
                            >
                              ↻
                            </button>
                            <button
                              type="button"
                              aria-label="Xóa trang này"
                              onClick={() => removeOrganizeItem(idx)}
                              className="btn-ghost h-11 w-full justify-center border border-line px-0 text-danger"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {tool === 'numbers' && (
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Vị trí số trang</p>
                  <div className="grid grid-cols-3 gap-2">
                    {POSITIONS.map((pos) => (
                      <button
                        key={pos.value}
                        type="button"
                        aria-pressed={numPosition === pos.value}
                        onClick={() => setNumPosition(pos.value)}
                        className={`min-h-11 rounded-control border px-2 text-[12px] transition-colors duration-150 ${
                          numPosition === pos.value
                            ? 'border-accent bg-accent-soft font-semibold text-accent'
                            : 'border-line bg-surface text-muted hover:border-line-strong hover:text-text'
                        }`}
                      >
                        {pos.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Kiểu hiển thị</p>
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          { value: 'number', label: '1, 2, 3' },
                          { value: 'x-of-y', label: '1 / N' },
                          { value: 'trang-x-of-y', label: 'Trang 1 / N' },
                        ] as const
                      ).map((fmt) => (
                        <button
                          key={fmt.value}
                          type="button"
                          aria-pressed={numFormat === fmt.value}
                          onClick={() => setNumFormat(fmt.value)}
                          className={`min-h-11 rounded-control border px-3 text-[12px] transition-colors duration-150 ${
                            numFormat === fmt.value
                              ? 'border-accent bg-accent-soft font-semibold text-accent'
                              : 'border-line bg-surface text-muted hover:border-line-strong hover:text-text'
                          }`}
                        >
                          {fmt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-end gap-4">
                    <div>
                      <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Cỡ chữ</p>
                      <div className="flex gap-1.5">
                        {([10, 12, 14] as const).map((sz) => (
                          <button
                            key={sz}
                            type="button"
                            aria-pressed={numSize === sz}
                            onClick={() => setNumSize(sz)}
                            className={`min-h-11 min-w-11 rounded-control border px-2.5 text-[12px] tabular transition-colors duration-150 ${
                              numSize === sz
                                ? 'border-accent bg-accent-soft font-semibold text-accent'
                                : 'border-line bg-surface text-muted hover:border-line-strong hover:text-text'
                            }`}
                          >
                            {sz}
                          </button>
                        ))}
                      </div>
                    </div>

                    <label className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Bắt đầu từ</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        value={Number.isFinite(startNumber) ? startNumber : ''}
                        onChange={(event) => setStartNumber(event.target.value === '' ? 1 : Number(event.target.value))}
                        className="h-11 w-16 rounded-control border border-line bg-surface px-2 text-center text-base tabular text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft sm:text-sm"
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}

            {tool === 'watermark' && (
              <div className="space-y-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Nội dung dấu mờ</span>
                  <input
                    type="text"
                    value={wmText}
                    onChange={(event) => setWmText(event.target.value)}
                    placeholder="Ví dụ: TÀI LIỆU LƯU HÀNH NỘI BỘ"
                    className="h-11 w-full rounded-control border border-line bg-surface px-3 text-base text-text outline-none placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent-soft sm:text-[13px]"
                  />
                </label>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Góc &amp; kiểu đặt</p>
                    <div className="flex flex-wrap gap-2">
                      {([-45, 0, 45] as const).map((deg) => (
                        <button
                          key={deg}
                          type="button"
                          aria-pressed={wmAngle === deg}
                          onClick={() => setWmAngle(deg)}
                          className={`min-h-11 min-w-11 rounded-control border px-3 text-[12px] tabular transition-colors duration-150 ${
                            wmAngle === deg
                              ? 'border-accent bg-accent-soft font-semibold text-accent'
                              : 'border-line bg-surface text-muted hover:border-line-strong hover:text-text'
                          }`}
                        >
                          {deg}°
                        </button>
                      ))}
                      <button
                        type="button"
                        aria-pressed={wmTile}
                        onClick={() => setWmTile((prev) => !prev)}
                        className={`min-h-11 rounded-control border px-3 text-[12px] transition-colors duration-150 ${
                          wmTile
                            ? 'border-accent bg-accent-soft font-semibold text-accent'
                            : 'border-line bg-surface text-muted hover:border-line-strong hover:text-text'
                        }`}
                      >
                        {wmTile ? 'Lát kín toàn trang' : 'Giữa trang'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Độ mờ &amp; màu</p>
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          { val: 0.15, label: '15%' },
                          { val: 0.25, label: '25%' },
                          { val: 0.4, label: '40%' },
                        ] as const
                      ).map((op) => (
                        <button
                          key={op.val}
                          type="button"
                          aria-pressed={wmOpacity === op.val}
                          onClick={() => setWmOpacity(op.val)}
                          className={`min-h-11 min-w-11 rounded-control border px-2.5 text-[12px] tabular transition-colors duration-150 ${
                            wmOpacity === op.val
                              ? 'border-accent bg-accent-soft font-semibold text-accent'
                              : 'border-line bg-surface text-muted hover:border-line-strong hover:text-text'
                          }`}
                        >
                          {op.label}
                        </button>
                      ))}
                      {WATERMARK_COLORS.map((c) => (
                        <button
                          key={c.hex}
                          type="button"
                          aria-pressed={wmColor === c.hex}
                          onClick={() => setWmColor(c.hex)}
                          className={`min-h-11 min-w-11 rounded-control border px-2.5 text-[12px] transition-colors duration-150 ${
                            wmColor === c.hex
                              ? 'border-accent bg-accent-soft font-semibold text-accent'
                              : 'border-line bg-surface text-muted hover:border-line-strong hover:text-text'
                          }`}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <label className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-faint">
                    Trang áp dụng (tùy chọn)
                  </span>
                  <input
                    type="text"
                    value={wmRange}
                    onChange={(event) => setWmRange(event.target.value)}
                    placeholder="Để trống = tất cả · vd: 1-3, lẻ, cuối"
                    spellCheck={false}
                    className="h-11 w-full rounded-control border border-line bg-surface px-3 text-base text-text outline-none placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent-soft sm:text-[13px]"
                  />
                </label>
              </div>
            )}

            {tool === 'blank' && (
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Độ nhạy nhận diện trang trắng</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {(
                      [
                        { val: 80, label: 'Vừa (khuyên dùng)' },
                        { val: 92, label: 'Chặt (chỉ trang thật trắng)' },
                        { val: 60, label: 'Thoáng (gồm vết mờ nhẹ)' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.val}
                        type="button"
                        aria-pressed={sensitivity === opt.val}
                        onClick={() => setSensitivity(opt.val)}
                        className={`min-h-11 rounded-control border px-3 text-[12px] transition-colors duration-150 ${
                          sensitivity === opt.val
                            ? 'border-accent bg-accent-soft font-semibold text-accent'
                            : 'border-line bg-surface text-muted hover:border-line-strong hover:text-text'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleScanBlank}
                      className="btn-primary ml-auto px-4"
                    >
                      Quét trang trắng
                    </button>
                  </div>
                </div>

                {blankScanned && blankMatches.length === 0 && (
                  <p className="rounded-card border border-line bg-surface px-3.5 py-2.5 text-xs text-muted">
                    Không phát hiện trang trắng nào trong file này.
                  </p>
                )}

                {blankMatches.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs text-muted">
                      Phát hiện <strong className="text-text">{blankMatches.length}</strong> trang trắng — bấm để giữ lại hoặc xóa:
                    </p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {blankMatches.map((match) => {
                        const checked = selectedBlanks.includes(match.pageNumber)
                        return (
                          <button
                            key={match.pageNumber}
                            type="button"
                            aria-pressed={checked}
                            onClick={() => toggleBlankPage(match.pageNumber)}
                            className={`flex min-h-11 flex-col items-start rounded-card border p-2 text-left transition-colors ${
                              checked
                                ? 'border-danger bg-surface ring-1 ring-danger/40'
                                : 'border-line bg-surface opacity-70 hover:opacity-100'
                            }`}
                          >
                            {match.thumbnailUrl && (
                              <img
                                src={match.thumbnailUrl}
                                alt={`Trang ${match.pageNumber}`}
                                className="aspect-[3/4] w-full rounded bg-bg object-contain"
                              />
                            )}
                            <span className="mt-2 flex w-full items-center justify-between text-[11px] tabular">
                              <span className="font-medium text-text">Trang {match.pageNumber}</span>
                              <span className={checked ? 'font-semibold text-danger' : 'text-muted'}>
                                {checked ? 'Sẽ xóa' : 'Giữ lại'}
                              </span>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {tool === 'nup' && (
              <div>
                <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Số trang trên 1 mặt giấy A4</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="In gộp trang">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={nupSheets === 2}
                    onClick={() => setNupSheets(2)}
                    className={`min-h-11 rounded-card border px-3 py-2.5 text-left transition-colors duration-150 ${
                      nupSheets === 2
                        ? 'border-accent bg-accent-soft text-text'
                        : 'border-line bg-surface text-muted hover:border-line-strong hover:text-text'
                    }`}
                  >
                    <span className={`block text-[12px] font-semibold ${nupSheets === 2 ? 'text-accent' : 'text-text'}`}>
                      2 trang / 1 tờ A4 ngang
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted">Tiện in đề thi tiết kiệm giấy</span>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={nupSheets === 4}
                    onClick={() => setNupSheets(4)}
                    className={`min-h-11 rounded-card border px-3 py-2.5 text-left transition-colors duration-150 ${
                      nupSheets === 4
                        ? 'border-accent bg-accent-soft text-text'
                        : 'border-line bg-surface text-muted hover:border-line-strong hover:text-text'
                    }`}
                  >
                    <span className={`block text-[12px] font-semibold ${nupSheets === 4 ? 'text-accent' : 'text-text'}`}>
                      4 trang / 1 tờ A4 dọc
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted">In phiếu ôn tập, slide bài giảng</span>
                  </button>
                </div>
              </div>
            )}

            {tool === 'pagesize' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Khổ giấy đích</p>
                    <div className="flex flex-wrap gap-2">
                      {(['A4', 'A5'] as const).map((sz) => (
                        <button
                          key={sz}
                          type="button"
                          aria-pressed={stdSize === sz}
                          onClick={() => setStdSize(sz)}
                          className={`min-h-11 min-w-16 rounded-control border px-4 text-[12px] transition-colors duration-150 ${
                            stdSize === sz
                              ? 'border-accent bg-accent-soft font-semibold text-accent'
                              : 'border-line bg-surface text-muted hover:border-line-strong hover:text-text'
                          }`}
                        >
                          {sz}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Cách căn trang</p>
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          { val: 'fit', label: 'Vừa khung · giữ đủ chữ' },
                          { val: 'fill', label: 'Lấp đầy khung' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.val}
                          type="button"
                          aria-pressed={stdMode === opt.val}
                          onClick={() => setStdMode(opt.val)}
                          className={`min-h-11 rounded-control border px-3 text-[12px] transition-colors duration-150 ${
                            stdMode === opt.val
                              ? 'border-accent bg-accent-soft font-semibold text-accent'
                              : 'border-line bg-surface text-muted hover:border-line-strong hover:text-text'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Chiều giấy</p>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        { val: 'auto', label: 'Tự động theo trang gốc' },
                        { val: 'portrait', label: 'Dọc' },
                        { val: 'landscape', label: 'Ngang' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.val}
                        type="button"
                        aria-pressed={stdOrient === opt.val}
                        onClick={() => setStdOrient(opt.val)}
                        className={`min-h-11 min-w-14 rounded-control border px-3 text-[12px] transition-colors duration-150 ${
                          stdOrient === opt.val
                            ? 'border-accent bg-accent-soft font-semibold text-accent'
                            : 'border-line bg-surface text-muted hover:border-line-strong hover:text-text'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tool === 'crop' && (
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Chọn nhanh lề cắt (mm)</p>
                  <div className="flex flex-wrap gap-2">
                    {CROP_PRESETS.map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => {
                          setCropTop(preset.value)
                          setCropBottom(preset.value)
                          setCropLeft(preset.value)
                          setCropRight(preset.value)
                        }}
                        className="min-h-11 rounded-control border border-line bg-surface px-3 text-[12px] text-text transition-colors hover:border-line-strong hover:bg-surface-hover"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {(
                    [
                      { label: 'Trên (mm)', val: cropTop, set: setCropTop },
                      { label: 'Dưới (mm)', val: cropBottom, set: setCropBottom },
                      { label: 'Trái (mm)', val: cropLeft, set: setCropLeft },
                      { label: 'Phải (mm)', val: cropRight, set: setCropRight },
                    ] as const
                  ).map((field) => (
                    <label key={field.label} className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-faint">{field.label}</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={field.val}
                        onChange={(event) => field.set(event.target.value)}
                        className="h-11 w-full rounded-control border border-line bg-surface px-3 text-center text-base tabular text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft sm:text-sm"
                      />
                    </label>
                  ))}
                </div>

                {cropNumbers.error && <p className="text-xs text-danger">{cropNumbers.error}</p>}

                <label className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-faint">
                    Trang áp dụng (tùy chọn)
                  </span>
                  <input
                    type="text"
                    value={cropRange}
                    onChange={(event) => setCropRange(event.target.value)}
                    placeholder="Để trống = tất cả · vd: 1-4, lẻ, cuối"
                    spellCheck={false}
                    className="h-11 w-full rounded-control border border-line bg-surface px-3 text-base text-text outline-none placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent-soft sm:text-[13px]"
                  />
                </label>
              </div>
            )}

            {tool === 'metadata' && (
              <div className="rounded-card border border-line bg-surface p-3.5 text-xs">
                <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.1em] text-faint">
                  Thông tin ẩn đang lưu trong file PDF
                </p>
                {metadataEntries.length === 0 ? (
                  <p className="text-muted">
                    Không phát hiện thông tin tác giả/phần mềm ẩn. Bạn vẫn có thể bấm xóa để làm sạch XMP &amp; mã định danh.
                  </p>
                ) : (
                  <dl className="space-y-1.5">
                    {metadataEntries.map(([label, val]) => (
                      <div key={label} className="flex flex-wrap gap-2">
                        <dt className="w-28 shrink-0 text-muted">{label}:</dt>
                        <dd className="min-w-0 flex-1 break-words font-medium text-text">{val}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            )}

            {rangeCheck.error && <p className="text-xs text-danger">{rangeCheck.error}</p>}

            <label className="flex flex-col gap-1.5 border-t border-line pt-4">
              <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Tên file xuất</span>
              <div className="flex h-11 items-center rounded-control border border-line bg-surface px-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft">
                <input
                  type="text"
                  aria-label="Tên file xuất"
                  value={filename}
                  onChange={(event) => setFilename(event.target.value)}
                  placeholder="tai-lieu-da-sua"
                  spellCheck={false}
                  className="min-h-11 min-w-0 flex-1 bg-transparent text-[13px] text-text outline-none placeholder:text-faint"
                />
                <span className="ml-2 shrink-0 text-[11px] text-faint">.pdf</span>
              </div>
            </label>
          </div>

          <StickyActionBar
            busy={busy}
            disabled={actionDisabled}
            label={actionLabel}
            onAction={handleExport}
            secondary={actionDisabled ? undefined : { label: 'Xem trước', onClick: handlePreview }}
            summary={
              <>
                <span className="font-semibold text-text">
                  {tool === 'organize' ? organizePlan.length : pageCount}
                </span>{' '}
                trang · {TOOLS.find((t) => t.value === tool)?.label}
              </>
            }
          />
        </>
      )}

      <PdfPreviewModal
        open={previewOpen}
        bytes={previewBytes}
        title="Xem trước kết quả chỉnh trang"
        onClose={() => setPreviewOpen(false)}
        onDownload={() => {
          if (previewBytes) downloadBytes(previewBytes, outName)
          setPreviewOpen(false)
        }}
      />

      <StatusLine message={message} status={status} />
    </section>
  )
}
