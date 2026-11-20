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
  return (
    <div role="tablist" aria-label="Chức năng" className="flex gap-6 border-b border-neutral-200">
      {TABS.map((tab) => {
        const selected = active === tab.key
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`tab-${tab.key}`}
            aria-controls={tab.panel}
            aria-selected={selected}
            onClick={() => onChange(tab.key)}
            className={`-mb-px border-b-2 pb-3 pt-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 ${
              selected
                ? 'border-neutral-950 font-medium text-neutral-950'
                : 'border-transparent text-neutral-500 hover:text-neutral-950'
            }`}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
