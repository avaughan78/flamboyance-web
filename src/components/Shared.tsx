import type { CSSProperties, ReactNode } from 'react'

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        padding: 20,
        gap: 18,
        maxWidth: 480,
        margin: '0 auto',
      }}
    >
      {children}
    </div>
  )
}

export function Wordmark() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <img src={`${import.meta.env.BASE_URL}flamingo.png`} alt="" style={{ height: 26, width: 'auto' }} />
      <span style={{ fontSize: 15, fontWeight: 600 }}>Flamboyance</span>
    </div>
  )
}

// Mirrors the native app's toolbar leave button (SF Symbol
// "rectangle.portrait.and.arrow.right") — an exit-door glyph, since there's
// no icon library here to draw from.
export function LeaveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Leave"
      style={{
        alignSelf: 'flex-end',
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        color: 'var(--fb-text-3)',
        display: 'flex',
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
    </button>
  )
}

// Mirrors CountdownRing.swift in the native app — a big circular countdown
// instead of a plain "0:07". secondsRemaining only ticks once a second, but
// the CSS transition on strokeDashoffset animates each step smoothly into
// the next, so the ring reads as continuously draining rather than jumping.
export function CountdownRing({
  secondsRemaining,
  totalSeconds,
  size = 56,
}: {
  secondsRemaining: number
  totalSeconds: number
  size?: number
}) {
  const radius = (size - 4) / 2
  const circumference = 2 * Math.PI * radius
  const progress = secondsRemaining / totalSeconds
  const isUrgent = secondsRemaining <= 3
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--fb-rule)" strokeWidth={4} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={isUrgent ? 'var(--fb-accent)' : 'var(--fb-accent-text)'}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size * 0.36,
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          color: isUrgent ? 'var(--fb-accent)' : 'var(--fb-text)',
        }}
      >
        {secondsRemaining}
      </div>
    </div>
  )
}

export function Avatar({ initial, emphasized = false, size = 32 }: { initial: string; emphasized?: boolean; size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: '50%',
        background: emphasized ? 'var(--fb-tint-row-bg)' : 'var(--fb-surface)',
        border: `1px solid ${emphasized ? 'var(--fb-tint-row-border)' : 'var(--fb-border)'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.4,
        fontWeight: 600,
        color: emphasized ? 'var(--fb-accent-text)' : 'var(--fb-text-3)',
      }}
    >
      {initial}
    </div>
  )
}

// Mirrors ResultsView.rankBadge in the native app — a crown for 1st, a
// numbered medal circle for 2nd/3rd, plain rank text below that.
export function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span style={{ width: 24, display: 'flex', justifyContent: 'center', color: 'var(--fb-accent-text)' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M2 18h20l-1.6-9-4.9 4.3L12 6.5l-3.5 6.8L3.6 9z" />
        </svg>
      </span>
    )
  }
  if (rank <= 3) {
    return (
      <span
        style={{
          width: 22,
          height: 22,
          flexShrink: 0,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 700,
          color: 'var(--fb-text-2)',
          background: 'var(--fb-surface)',
          border: '1px solid var(--fb-border-strong)',
        }}
      >
        {rank}
      </span>
    )
  }
  return (
    <span style={{ width: 24, textAlign: 'center', fontSize: 12, color: 'var(--fb-text-3)', fontVariantNumeric: 'tabular-nums' }}>
      {String(rank).padStart(2, '0')}
    </span>
  )
}

export const inputStyle: CSSProperties = {
  padding: '14px 16px',
  borderRadius: 11,
  background: 'var(--fb-surface)',
  border: '1px solid var(--fb-border)',
  color: 'var(--fb-text)',
  fontSize: 16,
  outline: 'none',
}
