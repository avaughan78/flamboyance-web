import { useEffect, useRef, useState } from 'react'
import { Shell } from '../components/Shared'
import { PillButton } from '../components/PillButton'
import { duelMatchmake, leaveDuelQueue, listAnonymousDuelQueue, type DuelMatchResult } from './duelApi'

const MATCHMAKE_POLL_MS = 1500

export function DuelMatchmaking({
  displayName,
  preferredOpponentId,
  shareCode,
  currentUserId,
  onMatched,
  onCancel,
}: {
  displayName: string
  preferredOpponentId: string | null
  shareCode: string | null
  currentUserId: string | null
  onMatched: (result: DuelMatchResult) => void
  onCancel: () => void
}) {
  const [queueCount, setQueueCount] = useState(0)
  const [copied, setCopied] = useState(false)
  const onMatchedRef = useRef(onMatched)
  onMatchedRef.current = onMatched

  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      try {
        const result = await duelMatchmake(displayName, preferredOpponentId, shareCode)
        if (cancelled) return
        if (result.matched) {
          onMatchedRef.current(result)
          return
        }
      } catch {
        // transient — the next tick just tries again
      }
      if (currentUserId) {
        listAnonymousDuelQueue(currentUserId).then((ids) => {
          if (!cancelled) setQueueCount(ids.length)
        })
      }
    }
    poll()
    const id = window.setInterval(poll, MATCHMAKE_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayName, preferredOpponentId, shareCode, currentUserId])

  useEffect(() => {
    return () => {
      leaveDuelQueue()
    }
  }, [])

  function copyShareCode() {
    if (!shareCode) return
    navigator.clipboard?.writeText(shareCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <Shell>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 22, textAlign: 'center' }}>
        <Spinner />

        {shareCode ? (
          <div className="fb-tint-card" style={{ textAlign: 'center' }}>
            <p className="fb-kicker" style={{ marginBottom: 8 }}>
              SHARE THIS CODE
            </p>
            <p style={{ fontSize: 34, fontWeight: 600, letterSpacing: 6, margin: 0, color: 'var(--fb-accent-text)' }}>
              {shareCode}
            </p>
            <button
              onClick={copyShareCode}
              style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: 'var(--fb-accent-mid)', cursor: 'pointer' }}
            >
              {copied ? 'Copied!' : 'Tap to copy'}
            </button>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
              {preferredOpponentId ? 'Challenging your friend…' : 'Finding an opponent…'}
            </p>
            {!preferredOpponentId && queueCount > 0 && (
              <p style={{ fontSize: 13, color: 'var(--fb-text-3)', margin: '8px 0 0' }}>
                {queueCount} other {queueCount === 1 ? 'player' : 'players'} looking right now
              </p>
            )}
          </div>
        )}

        <PillButton style="ghost" onClick={onCancel}>
          Cancel
        </PillButton>
      </div>
    </Shell>
  )
}

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: '3px solid var(--fb-rule)',
          borderTopColor: 'var(--fb-accent)',
          animation: 'fb-spin 0.9s linear infinite',
        }}
      />
    </div>
  )
}
