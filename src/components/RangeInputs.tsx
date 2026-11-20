type NumberBoxProps = {
  label: string
  value: number
  max: number
  onChange: (value: number) => void
}

function NumberBox({ label, value, max, onChange }: NumberBoxProps) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-faint">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        aria-label={label}
        min={1}
        max={max}
        value={Number.isFinite(value) ? value : ''}
        onChange={(event) => onChange(event.target.value === '' ? 0 : Number(event.target.value))}
        className="h-11 w-14 rounded-control border border-line bg-surface px-1 text-center text-base tabular text-text outline-none transition-colors duration-150 hover:border-line-strong focus:border-accent focus:ring-2 focus:ring-accent-soft sm:w-16 sm:text-sm"
      />
    </label>
  )
}

type Props = {
  from: number
  to: number
  max: number
  onChange: (from: number, to: number) => void
}

export function RangeInputs({ from, to, max, onChange }: Props) {
  return (
    <div className="flex items-end gap-2">
      <NumberBox label="Từ" value={from} max={max} onChange={(value) => onChange(value, to)} />
      <span aria-hidden="true" className="pb-3.5 text-xs text-faint">
        →
      </span>
      <NumberBox label="Đến" value={to} max={max} onChange={(value) => onChange(from, value)} />
      <span className="pb-3.5 text-xs tabular text-faint">/ {max}</span>
    </div>
  )
}
