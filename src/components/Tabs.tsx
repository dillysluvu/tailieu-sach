import { Fragment, useRef, type ReactNode } from 'react'
import { TAB_LIST } from '../lib/tabs'
import type { TabKey } from '../types'

type Props = {
  active: TabKey
  onChange: (tab: TabKey) => void
}

const TAB_ICONS: Record<TabKey, ReactNode> = {
  pdf: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4 shrink-0">
      <path d="M6 3h8l4 4v14H6z" strokeLinejoin="round" />
      <path d="M14 3v4h4M9 12h6M9 16h6" strokeLinecap="round" />
    </svg>
  ),
  split: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4 shrink-0">
      <path d="M4 6h7v12H4zM13 6h7v12h-7z" strokeLinejoin="round" />
      <path d="M12 3v18" strokeLinecap="round" strokeDasharray="2 3" />
    </svg>
  ),
  compress: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4 shrink-0">
      <path d="M6 3h8l4 4v14H6z" strokeLinejoin="round" />
      <path d="M12 9v6m0 0-2.5-2.5M12 15l2.5-2.5M9 18h6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  edit: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4 shrink-0">
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <path d="M9 9h6M9 13h4M9 17h6" strokeLinecap="round" />
    </svg>
  ),
  pdf2img: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4 shrink-0">
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="8.5" cy="9" r="1.5" />
      <path d="m4 17 5-5 4 4 3-3 4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  pdf2word: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4 shrink-0">
      <path d="M5 4h9l5 5v11H5z" strokeLinejoin="round" />
      <path d="M14 4v5h5M8 13l1.5 4L11 14l1.5 3L14 13" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  word: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4 shrink-0">
      <path d="M6 3h8l4 4v14H6z" strokeLinejoin="round" />
      <path d="M14 3v4h4M9 14h6m-3-3 3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  image: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4 shrink-0">
      <rect x="3" y="4" width="13" height="12" rx="2.5" />
      <path d="M8 19h11a2 2 0 0 0 2-2V9" strokeLinecap="round" />
      <path d="m6 13 3-3 3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
}

export function Tabs({ active, onChange }: Props) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([])

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    let next = index
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % TAB_LIST.length
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + TAB_LIST.length) % TAB_LIST.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = TAB_LIST.length - 1
    else return

    event.preventDefault()
    onChange(TAB_LIST[next].key)
    buttons.current[next]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label="Chọn công cụ xử lý tài liệu"
      className="grid grid-cols-2 gap-1.5 md:flex md:flex-col md:gap-0.5"
    >
      {TAB_LIST.map((tab, index) => {
        const selected = active === tab.key
        const isFirstOrganize = index === 0
        const isFirstConvert = index > 0 && TAB_LIST[index - 1].group !== tab.group
        return (
          <Fragment key={tab.key}>
            {isFirstOrganize && (
              <p
                aria-hidden="true"
                className="hidden px-2.5 pb-1 pt-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-faint md:block"
              >
                Xử lý PDF
              </p>
            )}
            {isFirstConvert && (
              <p
                aria-hidden="true"
                className="hidden px-2.5 pb-1 pt-3.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-faint md:block"
              >
                Chuyển đổi
              </p>
            )}
            <button
              ref={(element) => {
                buttons.current[index] = element
              }}
              type="button"
              role="tab"
              id={`tab-${tab.key}`}
              aria-controls={tab.panel}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.key)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={`group flex min-h-11 items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-left transition-colors duration-150 ${
                selected
                  ? 'bg-accent-soft text-accent'
                  : 'border border-line bg-surface text-muted hover:bg-surface-hover hover:text-text md:border-transparent md:bg-transparent'
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] transition-colors duration-150 ${
                  selected
                    ? 'bg-accent text-white shadow-[0_1px_3px_rgba(0,113,227,0.35)]'
                    : 'bg-surface-hover text-muted group-hover:text-text'
                }`}
              >
                {TAB_ICONS[tab.key]}
              </span>
              <span className={`truncate text-[12.5px] sm:text-[13px] ${selected ? 'font-semibold text-accent' : 'font-medium text-text'}`}>
                {tab.label}
              </span>
            </button>
          </Fragment>
        )
      })}
    </div>
  )
}
