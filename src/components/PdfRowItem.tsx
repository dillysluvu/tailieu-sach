import { useState } from 'react'
import { m, useReducedMotion } from 'motion/react'
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
  'touch-target flex items-center justify-center rounded-control text-[15px] text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-text'

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
  const [over, setOver] = useState(false)
  const reduce = useReducedMotion()
  const issue = rangeIssue(row.from, row.to, row.pageCount)

  return (
    <m.li
      layout={reduce ? false : 'position'}
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: dragging ? 0.4 : 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0 }}
      transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('text/plain')) {
          event.preventDefault()
          setOver(true)
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        const sourceId = event.dataTransfer.getData('text/plain')
        if (!sourceId) return
        event.preventDefault()
        setOver(false)
        onDrop(sourceId, row.id)
      }}
      className={`border-b border-line py-3 ${over ? 'rounded-control bg-accent-soft ring-1 ring-accent' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-2 md:flex-nowrap md:gap-3">
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
          className="touch-target flex shrink-0 cursor-grab select-none items-center justify-center rounded-control text-base leading-none text-faint transition-colors duration-150 hover:bg-surface-hover hover:text-text active:cursor-grabbing"
        >
          ⠿
        </span>

        <div className="flex min-w-0 basis-[calc(100%-64px)] items-start gap-2 flex-1 md:basis-auto">
          <span className="mt-0.5 shrink-0 rounded bg-accent-soft px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.08em] text-accent">
            PDF
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium tracking-[-0.01em] text-text" title={row.name}>
              {row.name}
            </p>
            <p className="mt-0.5 text-[11px] tabular text-muted">{row.pageCount} trang</p>
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center justify-between gap-2 md:w-auto md:flex-nowrap md:justify-end">
          <RangeInputs
            from={row.from}
            to={row.to}
            max={row.pageCount}
            onChange={(from, to) => onUpdate(row.id, { from, to })}
          />
          <div className="ml-auto flex items-center gap-0.5 md:ml-2">
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
      </div>

      {issue && <p className="mt-1 pl-13 text-[11px] text-danger md:pl-14">{issue}</p>}
    </m.li>
  )
}
