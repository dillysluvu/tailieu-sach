import type { ThemePreference } from '../types'

type Props = {
  preference: ThemePreference
  onCycle: () => void
}

const NEXT_LABEL: Record<ThemePreference, string> = {
  system: 'Chế độ sáng',
  light: 'Chế độ tối',
  dark: 'Theo hệ thống',
}

const CURRENT_LABEL: Record<ThemePreference, string> = {
  system: 'Hệ thống',
  light: 'Sáng',
  dark: 'Tối',
}

function ThemeIcon({ name }: { name: ThemePreference }) {
  if (name === 'system') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-[16px] w-[16px]">
        <rect x="3" y="4" width="18" height="13" rx="2.5" />
        <path d="M8 21h8M12 17v4" strokeLinecap="round" />
      </svg>
    )
  }
  if (name === 'light') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-[16px] w-[16px]">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-[16px] w-[16px]">
      <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z" strokeLinejoin="round" />
    </svg>
  )
}

export function ThemeToggle({ preference, onCycle }: Props) {
  return (
    <button
      type="button"
      onClick={onCycle}
      aria-label={`Đổi giao diện: tiếp theo là ${NEXT_LABEL[preference]}`}
      title={`Giao diện: ${CURRENT_LABEL[preference]} · bấm để đổi`}
      className="touch-target inline-flex items-center justify-center gap-1.5 rounded-full border border-line bg-group px-3 text-[12px] font-medium text-text/80 transition-colors duration-150 hover:border-line-strong hover:bg-surface-hover hover:text-text active:scale-[0.97]"
    >
      <ThemeIcon name={preference} />
      <span className="hidden sm:inline">{CURRENT_LABEL[preference]}</span>
    </button>
  )
}
