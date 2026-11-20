type NumberBoxProps = {
  label: string
  value: number
  max: number
  onChange: (value: number) => void
}

function NumberBox({ label, value, max, onChange }: NumberBoxProps) {
  return (
    <input
      type="number"
      aria-label={label}
      min={1}
      max={max}
      value={Number.isFinite(value) ? value : ''}
      onChange={(event) => onChange(event.target.value === '' ? 0 : Number(event.target.value))}
      className="w-14 rounded border-b border-neutral-300 bg-white px-1 py-1 text-center text-sm tabular-nums text-neutral-950 focus:border-neutral-950 focus:outline-none"
    />
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
    <div className="flex items-center gap-2">
      <NumberBox label="Từ trang" value={from} max={max} onChange={(value) => onChange(value, to)} />
      <span aria-hidden="true" className="text-xs text-neutral-400">
        →
      </span>
      <NumberBox label="Đến trang" value={to} max={max} onChange={(value) => onChange(from, value)} />
      <span className="text-xs tabular-nums text-neutral-400">/ {max}</span>
    </div>
  )
}
