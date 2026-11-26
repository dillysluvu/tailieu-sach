import { useRef, useState } from 'react'
import { m, useReducedMotion } from 'motion/react'
import { fileSizeLabel, LIMITS } from '../lib/errors'

type Props = {
  accept: string
  multiple: boolean
  title: string
  hint: string
  onFiles: (files: File[]) => void
  busy?: boolean
  compact?: boolean
}

export function Dropzone({ accept, multiple, title, hint, onFiles, busy = false, compact = false }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const reduce = useReducedMotion()
  const hasPdf = accept.includes('pdf')
  const hasImage = accept.includes('image')
  const chips =
    hasPdf && hasImage
      ? ['PDF · Ảnh chụp sách', fileSizeLabel]
      : hasPdf
        ? multiple
          ? ['PDF', fileSizeLabel, `${LIMITS.maxFilesPerDrop} file / lần`]
          : ['PDF', fileSizeLabel]
        : hasImage
          ? ['JPG · PNG · WebP', fileSizeLabel, `${LIMITS.maxFilesPerDrop} ảnh / lần`]
          : ['DOCX', fileSizeLabel]

  return (
    <div>
      <m.div
        role="button"
        tabIndex={0}
        aria-label={title}
        aria-busy={busy}
        data-state={over ? 'dragging' : 'idle'}
        onClick={() => input.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            input.current?.click()
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault()
          setOver(true)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          setOver(true)
        }}
        onDragLeave={(event) => {
          event.preventDefault()
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          setOver(false)
          onFiles(Array.from(event.dataTransfer.files))
        }}
        animate={reduce ? undefined : { scale: over ? 1.005 : 1 }}
        transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
        className={`cursor-pointer border-[1.5px] border-dashed transition-colors duration-150 ${
          compact
            ? 'flex min-h-14 flex-row items-center justify-between gap-3 rounded-[12px] px-3.5 py-2.5 text-left'
            : 'soft-shadow flex min-h-40 flex-col items-center justify-center gap-2.5 rounded-dropzone px-4 py-10 text-center sm:min-h-48 md:min-h-56'
        } ${
          over
            ? 'border-accent bg-accent-soft ring-4 ring-accent/15'
            : 'border-line-strong bg-group/65 hover:border-accent/60 hover:bg-accent-soft/35'
        }`}
      >
        <input
          ref={input}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(event) => {
            onFiles(Array.from(event.target.files ?? []))
            event.target.value = ''
          }}
        />
        {compact ? (
          <>
            <div className="flex min-w-0 items-center gap-3">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] transition-colors duration-150 ${
                  over ? 'bg-accent text-white' : 'bg-accent-soft text-accent'
                }`}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4.5 w-4.5">
                  <path d="M12 16V4m0 0L8 8m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" strokeLinecap="round" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold tracking-[-0.01em] text-text">{title}</p>
                <p className="truncate text-[11.5px] text-muted">{hint}</p>
              </div>
            </div>
            <span className="shrink-0 rounded-full border border-line bg-surface px-3 py-1.5 text-[11.5px] font-medium text-text">
              + Chọn file
            </span>
          </>
        ) : (
          <>
            <m.div
              animate={reduce ? undefined : { y: over ? -3 : 0, scale: over ? 1.04 : 1 }}
              transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
              className={`flex h-12 w-12 items-center justify-center rounded-[14px] transition-colors duration-150 ${
                over ? 'bg-accent text-white shadow-[0_6px_16px_-4px_rgba(0,113,227,0.45)]' : 'bg-accent-soft text-accent'
              }`}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-6 w-6">
                <path d="M12 16V4m0 0L8 8m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" strokeLinecap="round" />
              </svg>
            </m.div>
            <p className="text-[15px] font-semibold tracking-[-0.015em] text-text">{title}</p>
            <p className="max-w-md text-[12.5px] text-muted">{hint}</p>
            <div className="mt-0.5 flex flex-wrap items-center justify-center gap-1.5">
              {chips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-[10.5px] font-medium leading-4 text-muted"
                >
                  {chip}
                </span>
              ))}
            </div>
          </>
        )}
      </m.div>

      {!compact && (
        <div className="mt-4 hidden grid-cols-3 gap-3 md:grid">
          <div className="rounded-[12px] border border-line bg-group/80 px-3.5 py-3">
            <p className="text-[12px] font-semibold text-text">Riêng tư trên máy</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
              Xử lý trực tiếp trong trình duyệt, không tải file lên máy chủ.
            </p>
          </div>
          <div className="rounded-[12px] border border-line bg-group/80 px-3.5 py-3">
            <p className="text-[12px] font-semibold text-text">Hỗ trợ file lớn</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
              Nhận tối đa 500 MB/file, 100 file mỗi lần kéo thả.
            </p>
          </div>
          <div className="rounded-[12px] border border-line bg-group/80 px-3.5 py-3">
            <p className="text-[12px] font-semibold text-text">Thao tác phím tắt</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
              Nhấn <span className="font-medium text-text">⌘ / Ctrl + Enter</span> để xuất nhanh kết quả.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
