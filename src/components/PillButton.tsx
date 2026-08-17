import type { ReactNode } from 'react'

type Style = 'primary' | 'ghost' | 'text'

export function PillButton({
  children,
  trailing,
  style = 'primary',
  disabled = false,
  onClick,
}: {
  children: ReactNode
  trailing?: ReactNode
  style?: Style
  disabled?: boolean
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: trailing ? 'space-between' : 'center',
        width: style === 'text' ? 'auto' : '100%',
        padding: '14px 18px',
        borderRadius: 999,
        fontSize: 15,
        fontWeight: 600,
        fontFamily: "'Poppins', sans-serif",
        background: style === 'primary' ? 'var(--fb-gradient-primary)' : 'transparent',
        color: style === 'primary' ? '#fff' : style === 'ghost' ? 'var(--fb-ink)' : 'var(--fb-ink-soft)',
        border: style === 'ghost' ? '1.5px solid var(--fb-hairline-strong)' : 'none',
        boxShadow: style === 'primary' ? '0 8px 20px -6px rgba(214,35,79,.55)' : 'none',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span>{children}</span>
      {trailing && <span style={{ color: 'var(--fb-ink-soft)' }}>{trailing}</span>}
    </button>
  )
}
