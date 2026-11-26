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
}

export function Dropzone({ accept, multiple, title, hint, onFiles, busy = false }: Props) {
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
      className={`soft-shadow flex min-h-38 cursor-pointer flex-col items-center justify-center gap-2.5 rounded-dropzone border-[1.5px] border-dashed px-4 py-8 text-center transition-all duration-150 sm:min-h-46 ${
        over
          ? 'border-accent bg-accent-soft ring-4 ring-accent/15'
          : 'border-line-strong bg-bg/55 hover:border-accent/60 hover:bg-accent-soft/35'
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
      <p className="text-[14.5px] font-semibold tracking-[-0.015em] text-text">{title}</p>
      <p className="max-w-md text-[12.5px] text-muted">{hint}</p>
      <div className="mt-0.5 flex flex-wrap items-center justify-center gap-1.5">
        {chips.map((chip) => (
          <span
            key={chip}
            className="rounded-full border border-line bg-surface/90 px-2.5 py-0.5 text-[10.5px] font-medium leading-4 text-muted"
          >
            {chip}
          </span>
        ))}
      </div>
    </m.div>
  )
}
