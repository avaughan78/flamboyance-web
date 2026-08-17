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
        borderRadius: 11,
        fontSize: 15,
        fontWeight: 600,
        fontFamily: "'Inter', sans-serif",
        background: style === 'primary' ? 'var(--fb-tint-button-bg)' : 'transparent',
        color: style === 'primary' ? 'var(--fb-accent-text)' : style === 'ghost' ? 'var(--fb-text)' : 'var(--fb-text-3)',
        border:
          style === 'primary'
            ? '1px solid var(--fb-tint-button-border)'
            : style === 'ghost'
              ? '1px solid var(--fb-border-strong)'
              : 'none',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span>{children}</span>
      {trailing && <span style={{ color: 'var(--fb-text-3)' }}>{trailing}</span>}
    </button>
  )
}
