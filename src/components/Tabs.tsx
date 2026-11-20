import { useRef } from 'react'
import { m, useReducedMotion } from 'motion/react'
import type { TabKey } from '../types'

type Props = {
  active: TabKey
  onChange: (tab: TabKey) => void
}

const TABS: Array<{ key: TabKey; label: string; panel: string }> = [
  { key: 'pdf', label: 'Cắt & Gộp PDF', panel: 'panel-pdf' },
  { key: 'word', label: 'Word → PDF', panel: 'panel-word' },
]

export function Tabs({ active, onChange }: Props) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([])
  const reduce = useReducedMotion()

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
    <div role="tablist" aria-label="Chức năng" className="flex gap-5 border-b border-line sm:gap-7">
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
            className={`relative flex min-h-11 items-center text-[13px] transition-colors duration-150 ${
              selected ? 'font-semibold text-text' : 'text-muted hover:text-text'
            }`}
          >
            {tab.label}
            {selected && (
              <m.span
                layoutId="tab-indicator"
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 480, damping: 38, mass: 0.7 }}
                className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-text"
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
