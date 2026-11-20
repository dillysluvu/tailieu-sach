import { useRef, useState } from 'react'
import { m, useReducedMotion } from 'motion/react'

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
  const chips = accept.includes('pdf') ? ['PDF', '25 MB', '20 file / lần'] : ['DOCX', '25 MB']

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
      className={`flex min-h-35 cursor-pointer flex-col items-center justify-center gap-2 rounded-dropzone border border-dashed px-4 py-8 text-center transition-colors duration-150 sm:min-h-46 ${
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
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        animate={reduce ? undefined : { y: over ? -3 : 0, opacity: over ? 1 : 0.75 }}
        transition={{ duration: 0.18 }}
        className={`h-7 w-7 ${over ? 'text-accent' : 'text-faint'}`}
      >
        <path d="M12 16V4m0 0L8 8m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
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
