import { useEffect, useRef, useState } from 'react'
import { Shell } from '../components/Shared'
import { PillButton } from '../components/PillButton'
import { markDuelReady } from './duelApi'
import type { DBRoom } from '../types'

const READY_POLL_MS = 1000
const READY_REQUEST_TIMEOUT_MS = 6000
const READY_WALL_CLOCK_RETRY_MS = 20000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

export function MatchFound({
  room,
  opponentName,
  opponentRating,
  yourRating,
  onReady,
  onLeave,
}: {
  room: DBRoom
  opponentName: string
  opponentRating: number
  yourRating: number
  onReady: (room: DBRoom) => void
  onLeave: () => void
}) {
  const [isReady, setIsReady] = useState(false)
  const [showRetry, setShowRetry] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  useEffect(() => {
    let cancelled = false
    const startedAt = Date.now()
    let intervalId: number

    async function tick() {
      try {
        const result = await withTimeout(markDuelReady(room.id), READY_REQUEST_TIMEOUT_MS)
        if (cancelled) return
        setIsReady(true)
        if (result.room.status === 'active') {
          onReadyRef.current(result.room)
          return
        }
      } catch {
        // transient — the next tick just tries again
      }
      if (!cancelled && Date.now() - startedAt > READY_WALL_CLOCK_RETRY_MS) {
        setShowRetry(true)
        window.clearInterval(intervalId)
      }
    }

    tick()
    intervalId = window.setInterval(tick, READY_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [room.id, retryKey])

  return (
    <Shell>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 26, textAlign: 'center' }}>
        <div>
          <p className="fb-kicker" style={{ marginBottom: 8 }}>
            MATCH FOUND
          </p>
          <p style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.03em', margin: 0 }}>{opponentName}</p>
          <p style={{ fontSize: 13, color: 'var(--fb-text-3)', margin: '6px 0 0' }}>
            Rating {opponentRating} · You're {yourRating}
          </p>
        </div>

        {showRetry ? (
          <div>
            <p style={{ fontSize: 14, color: 'var(--fb-text-3)', margin: '0 0 14px' }}>
              Taking a while to sync up — try again?
            </p>
            <PillButton
              onClick={() => {
                setShowRetry(false)
                setRetryKey((k) => k + 1)
              }}
            >
              Retry
            </PillButton>
          </div>
        ) : (
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--fb-text-3)' }}>
            {isReady ? 'Waiting for them…' : 'Getting ready…'}
          </p>
        )}

        <PillButton style="text" onClick={onLeave}>
          Cancel
        </PillButton>
      </div>
    </Shell>
  )
}
