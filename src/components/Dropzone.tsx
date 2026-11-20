import { useRef, useState } from 'react'

type Props = {
  accept: string
  multiple: boolean
  title: string
  hint: string
  onFiles: (files: File[]) => void
}

export function Dropzone({ accept, multiple, title, hint, onFiles }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={title}
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
      className={`flex min-h-[160px] cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 sm:min-h-[184px] ${
        over ? 'border-neutral-950 bg-neutral-50' : 'border-neutral-300 bg-white hover:border-neutral-950'
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
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="h-6 w-6 text-neutral-400"
      >
        <path d="M12 16V4m0 0L8 8m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
      </svg>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-neutral-500">{hint}</p>
    </div>
  )
}
