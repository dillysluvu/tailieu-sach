import { rangeIssue } from '../lib/parse'
import type { PdfRow } from '../types'
import { RangeInputs } from './RangeInputs'

type Props = {
  row: PdfRow
  dragging: boolean
  onUpdate: (id: string, patch: Partial<Pick<PdfRow, 'from' | 'to'>>) => void
  onDuplicate: (id: string) => void
  onRemove: (id: string) => void
  onMove: (id: string, direction: -1 | 1) => void
  onDragStart: (id: string | null) => void
  onDrop: (sourceId: string, targetId: string) => void
}

const ACTION =
  'flex h-7 w-7 items-center justify-center rounded text-sm text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950'

export function PdfRowItem({
  row,
  dragging,
  onUpdate,
  onDuplicate,
  onRemove,
  onMove,
  onDragStart,
  onDrop,
}: Props) {
  const issue = rangeIssue(row.from, row.to, row.pageCount)

  return (
    <li
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        const sourceId = event.dataTransfer.getData('text/plain')
        if (sourceId) onDrop(sourceId, row.id)
      }}
      className={`border-b border-neutral-200 py-3 ${dragging ? 'opacity-40' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          draggable
          title="Kéo để đổi thứ tự"
          aria-label="Kéo để đổi thứ tự"
          onDragStart={(event) => {
            event.dataTransfer.setData('text/plain', row.id)
            event.dataTransfer.effectAllowed = 'move'
            onDragStart(row.id)
          }}
          onDragEnd={() => onDragStart(null)}
          className="cursor-grab select-none text-base leading-none text-neutral-400 hover:text-neutral-950"
        >
          ⠿
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm" title={row.name}>
            {row.name}
          </p>
          <p className="text-xs tabular-nums text-neutral-500">{row.pageCount} trang</p>
        </div>
        <RangeInputs
          from={row.from}
          to={row.to}
          max={row.pageCount}
          onChange={(from, to) => onUpdate(row.id, { from, to })}
        />
        <div className="flex items-center gap-0.5">
          <button type="button" title="Nhân bản đoạn" aria-label="Nhân bản đoạn" className={ACTION} onClick={() => onDuplicate(row.id)}>
            ⧉
          </button>
          <button type="button" title="Xóa dòng" aria-label="Xóa dòng" className={ACTION} onClick={() => onRemove(row.id)}>
            ×
          </button>
          <button type="button" title="Đưa lên" aria-label="Đưa lên" className={ACTION} onClick={() => onMove(row.id, -1)}>
            ↑
          </button>
          <button type="button" title="Đưa xuống" aria-label="Đưa xuống" className={ACTION} onClick={() => onMove(row.id, 1)}>
            ↓
          </button>
        </div>
      </div>
      {issue && <p className="mt-1 pl-6 text-xs text-red-700">{issue}</p>}
    </li>
  )
}
