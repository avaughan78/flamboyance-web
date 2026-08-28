import { useEffect, useState } from 'react'
import { Shell } from '../components/Shared'

/** The shared "here it comes" beat both players land on within normal
 * network-latency skew of each other, right after both are marked ready.
 * Purely ceremonial — question_started_at is already fixed server-side by
 * the time this shows, so it doesn't affect either player's answer window. */
export function DuelCountdown({ onComplete }: { onComplete: () => void }) {
  const [count, setCount] = useState(3)

  useEffect(() => {
    const delay = count === 0 ? 500 : 700
    const id = window.setTimeout(() => {
      if (count === 0) onComplete()
      else setCount((c) => c - 1)
    }, delay)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count])

  return (
    <Shell>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span
          key={count}
          style={{
            fontSize: 96,
            fontWeight: 700,
            color: 'var(--fb-accent-text)',
            animation: 'fb-countdown-pop 0.7s ease-out',
          }}
        >
          {count > 0 ? count : 'GO'}
        </span>
      </div>
    </Shell>
  )
}
