import { PAGE_PRESETS, type PagePreset } from '../lib/exportOptions'

type Props = {
  filename: string
  onFilename: (value: string) => void
  preset: PagePreset
  onPreset: (value: PagePreset) => void
  extension?: string
}

export function ExportOptions({ filename, onFilename, preset, onPreset, extension = 'pdf' }: Props) {
  return (
    <div className="mt-5 space-y-3 border-t border-line pt-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Tên file xuất</span>
        <div className="flex h-11 items-center rounded-control border border-line bg-surface px-3 transition-colors duration-150 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft">
          <input
            type="text"
            aria-label="Tên file xuất"
            autoComplete="off"
            spellCheck={false}
            value={filename}
            onChange={(event) => onFilename(event.target.value)}
            placeholder="ket-qua"
            className="min-h-11 min-w-0 flex-1 bg-transparent text-[13px] text-text outline-none placeholder:text-faint"
          />
          <span className="ml-2 shrink-0 text-[11px] text-faint">.{extension}</span>
        </div>
      </label>

      <div>
        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Chọn trang</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Chọn trang">
          {PAGE_PRESETS.map((option) => {
            const selected = option.value === preset
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => onPreset(option.value)}
                className={`min-h-11 rounded-control border px-3 text-[12px] transition-colors duration-150 ${
                  selected
                    ? 'border-accent bg-accent-soft font-semibold text-accent'
                    : 'border-line bg-surface text-muted hover:border-line-strong hover:text-text'
                }`}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
