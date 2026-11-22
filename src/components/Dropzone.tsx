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
      animate={reduce ? undefined : { scale: over ? 1.004 : 1 }}
      transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
      className={`soft-shadow flex min-h-35 cursor-pointer flex-col items-center justify-center gap-2 rounded-dropzone border border-dashed px-4 py-8 text-center transition-colors duration-150 sm:min-h-46 ${
        over
          ? 'border-accent bg-accent-soft'
          : 'border-line-strong bg-surface hover:border-accent hover:bg-accent-soft/40'
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
      <m.svg
        aria-hidden="true"
        viewBox="0 0 48 48"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        animate={reduce ? undefined : { y: over ? -3 : 0, opacity: over ? 1 : 0.8 }}
        transition={{ duration: 0.18 }}
        className={`h-11 w-11 ${over ? 'text-accent' : 'text-faint'}`}
      >
        <rect x="9" y="7" width="19" height="25" rx="3" opacity="0.45" />
        <rect x="20" y="14" width="19" height="25" rx="3" />
        <path d="M25 21h9M25 26h9M25 31h6" strokeLinecap="round" />
        <path d="M13 38v5m0 0-2.5-2.5M13 43l2.5-2.5" strokeLinecap="round" strokeLinejoin="round" />
      </m.svg>
      <p className="text-[13px] font-semibold tracking-[-0.01em] text-text">{title}</p>
      <p className="text-xs text-muted">{hint}</p>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5">
        {chips.map((chip) => (
          <span
            key={chip}
            className="rounded-full border border-line bg-bg px-2 py-0.5 text-[10px] leading-4 text-muted"
          >
            {chip}
          </span>
        ))}
      </div>
    </m.div>
  )
}
