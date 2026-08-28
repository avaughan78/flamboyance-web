import { useEffect, useState } from 'react'
import { Shell } from './Shared'

/** The shared "one more to go!" beat shown the instant a match/party
 * advances into its last question — used by both Duel and Party (which
 * detect the trigger independently, each from their own index == count-1
 * check). A v1 CSS stand-in for native's full glow/ring/haptics
 * FinalRoundAnimation. No server round-trip: question_started_at for the
 * final question is already fixed server-side by the time this shows, so
 * the animation's duration doesn't affect anyone's actual answer window. */
export function FinalRoundBeat({ onComplete }: { onComplete: () => void }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const showId = window.setTimeout(() => setVisible(true), 20)
    const doneId = window.setTimeout(onComplete, 2200)
    return () => {
      window.clearTimeout(showId)
      window.clearTimeout(doneId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Shell>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            textAlign: 'center',
            opacity: visible ? 1 : 0,
            transform: visible ? 'scale(1)' : 'scale(0.7)',
            transition: 'opacity 0.4s ease-out, transform 0.4s cubic-bezier(0.2, 0.8, 0.3, 1.3)',
          }}
        >
          <p
            style={{
              fontSize: 'clamp(32px, 9vw, 44px)',
              fontWeight: 700,
              letterSpacing: '0.02em',
              color: 'var(--fb-accent-bright)',
              margin: 0,
              textWrap: 'balance',
            }}
          >
            FINAL ROUND!
          </p>
          <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--fb-text-3)', margin: '10px 0 0' }}>Make it count</p>
        </div>
      </div>
    </Shell>
  )
}
