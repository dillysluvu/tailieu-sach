import { useRef, type ReactNode } from 'react'
import type { TabKey } from '../types'

type Props = {
  active: TabKey
  onChange: (tab: TabKey) => void
}

const TABS: Array<{ key: TabKey; label: string; hint: string; panel: string; icon: ReactNode }> = [
  {
    key: 'pdf',
    label: 'Cắt & Gộp PDF',
    hint: 'Ghép file, lấy đoạn trang',
    panel: 'panel-pdf',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4 shrink-0">
        <path d="M6 3h8l4 4v14H6z" strokeLinejoin="round" />
        <path d="M14 3v4h4M9 12h6M9 16h6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: 'split',
    label: 'Tách PDF',
    hint: 'Chia nhỏ thành nhiều file',
    panel: 'panel-split',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4 shrink-0">
        <path d="M4 6h7v12H4zM13 6h7v12h-7z" strokeLinejoin="round" />
        <path d="M12 3v18" strokeLinecap="round" strokeDasharray="2 3" />
      </svg>
    ),
  },
  {
    key: 'pdf2img',
    label: 'PDF → Ảnh',
    hint: 'Xuất ảnh nét gửi Zalo',
    panel: 'panel-pdf2img',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4 shrink-0">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="8.5" cy="9" r="1.5" />
        <path d="m4 17 5-5 4 4 3-3 4 4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: 'pdf2word',
    label: 'PDF → Word',
    hint: 'Sửa đề Toán – Văn (.docx)',
    panel: 'panel-pdf2word',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4 shrink-0">
        <path d="M5 4h9l5 5v11H5z" strokeLinejoin="round" />
        <path d="M14 4v5h5M8 13l1.5 4L11 14l1.5 3L14 13" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: 'word',
    label: 'Word → PDF',
    hint: 'Đổi .docx ra PDF & cắt',
    panel: 'panel-word',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4 shrink-0">
        <path d="M6 3h8l4 4v14H6z" strokeLinejoin="round" />
        <path d="M14 3v4h4M9 14h6m-3-3 3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: 'image',
    label: 'Ảnh → PDF',
    hint: 'Gom nhiều ảnh thành 1 file',
    panel: 'panel-image',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4 shrink-0">
        <rect x="3" y="4" width="13" height="12" rx="2" />
        <path d="M8 19h11a2 2 0 0 0 2-2V9" strokeLinecap="round" />
        <path d="m6 13 3-3 3 3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
]

export function Tabs({ active, onChange }: Props) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([])

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = TABS.length - 1
    else return

    event.preventDefault()
    onChange(TABS[next].key)
    buttons.current[next]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label="Chọn công cụ xử lý tài liệu"
      className="grid grid-cols-2 gap-2 sm:grid-cols-3"
    >
      {TABS.map((tab, index) => {
        const selected = active === tab.key
        return (
          <button
            key={tab.key}
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
            className={`group flex min-h-12 flex-col items-start justify-center rounded-card border px-3 py-2.5 text-left transition-colors duration-150 ${
              selected
                ? 'border-accent bg-accent-soft text-text shadow-[0_1px_2px_rgba(0,0,0,0.03)]'
                : 'border-line bg-surface text-muted hover:border-line-strong hover:text-text'
            }`}
          >
            <span className={`flex items-center gap-2 text-[12.5px] sm:text-[13px] ${selected ? 'font-semibold text-accent' : 'font-medium text-text'}`}>
              {tab.icon}
              <span>{tab.label}</span>
            </span>
            <span className="mt-0.5 hidden text-[11px] leading-tight text-muted sm:block">{tab.hint}</span>
          </button>
        )
      })}
    </div>
  )
}
