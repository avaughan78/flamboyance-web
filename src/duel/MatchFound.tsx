import { useEffect, useRef, useState } from 'react'
import { Shell, Avatar } from '../components/Shared'
import { PillButton } from '../components/PillButton'
import { markDuelReady } from './duelApi'
import { setCommunityTheme } from '../theme'
import type { ContentPool, DBRoom } from '../types'

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
  communityEnabled,
  onReady,
  onLeave,
}: {
  room: DBRoom
  opponentName: string
  opponentRating: number
  yourRating: number
  communityEnabled: boolean
  onReady: (room: DBRoom) => void
  onLeave: () => void
}) {
  const [isReady, setIsReady] = useState(false)
  const [showRetry, setShowRetry] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  // Editable up until Ready is tapped, defaulted to Original since web has
  // no Home-toggle equivalent to inherit from — either player can set
  // their own, the room only ever activates once both agree. Mirrors
  // MatchFoundView's chosenPool/opponentPool on native.
  const [chosenPool, setChosenPool] = useState<ContentPool>('original')
  const [opponentPool, setOpponentPool] = useState<ContentPool | null>(null)
  const [poolsMismatched, setPoolsMismatched] = useState(false)
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  // Reacts live as this player picks a pool, before the room itself is
  // authoritative (it only gets content_pool once both players agree and
  // the ready-gate flips it to active) — mirrors ThemeManager.isCommunity
  // being set from PartyLobbyView/MatchFoundView's own picker taps on iOS.
  useEffect(() => {
    setCommunityTheme(chosenPool === 'community')
  }, [chosenPool])

  // Mirrors native exactly: tapping Ready is what starts the poll loop —
  // this screen shows the match-up (rating comparison, format) first and
  // waits for an explicit confirmation, it doesn't silently commit the
  // instant the match is found.
  useEffect(() => {
    if (!isReady) return
    let cancelled = false
    const startedAt = Date.now()
    let intervalId: number

    async function tick() {
      try {
        const result = await withTimeout(markDuelReady(room.id, chosenPool), READY_REQUEST_TIMEOUT_MS)
        if (cancelled) return
        if (result.room.status === 'active') {
          onReadyRef.current(result.room)
          return
        }
        setOpponentPool(result.opponent_pool)
        setPoolsMismatched(result.all_ready && !result.pools_match)
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
  }, [room.id, isReady, retryKey, chosenPool])

  const total = yourRating + opponentRating
  const yourShare = total > 0 ? yourRating / total : 0.5

  return (
    <Shell>
      <p className="fb-kicker">DUEL · MATCH FOUND</p>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 26 }}>
        <div className="fb-tint-card">
          <p className="fb-kicker" style={{ marginBottom: 8 }}>
            MATCH FOUND
          </p>
          <p style={{ fontSize: 32, fontWeight: 500, lineHeight: 1.15, margin: 0, color: 'var(--fb-accent-bright)' }}>
            You
            <br />
            vs {opponentName}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <Avatar initial="Y" size={56} emphasized />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600 }}>
              <span style={{ color: 'var(--fb-accent-text)' }}>{yourRating}</span>
              <span style={{ color: 'var(--fb-text-3)' }}>{opponentRating}</span>
            </div>
            <div style={{ height: 4, borderRadius: 999, background: 'var(--fb-rule)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${yourShare * 100}%`, background: 'var(--fb-accent-text)' }} />
            </div>
          </div>
          <Avatar initial={opponentName.slice(0, 1)} size={56} emphasized />
        </div>

        <div>
          <DetailRow label="Topic" value="All collective nouns" />
          <DetailRow label="Format" value={`${room.question_ids.length} questions`} />
          <DetailRow
            label="At stake"
            value={chosenPool === 'community' ? 'Nothing — just for fun' : 'Rating'}
            showRule={false}
          />
        </div>

        {communityEnabled && (
          <div>
            <p className="fb-kicker" style={{ marginBottom: 8 }}>
              PLAYING FROM
            </p>
            <div style={{ display: 'flex', gap: 8, opacity: isReady ? 0.5 : 1 }}>
              <PoolOption label="Original" pool="original" chosenPool={chosenPool} onChoose={setChosenPool} disabled={isReady} />
              <PoolOption label="Community" pool="community" chosenPool={chosenPool} onChoose={setChosenPool} disabled={isReady} />
            </div>
          </div>
        )}
      </div>

      <p style={{ fontSize: 14, color: 'var(--fb-text-3)', textAlign: 'center', margin: '0 0 18px' }}>
        {poolsMismatched && !showRetry
          ? `You picked ${chosenPool === 'community' ? 'Community' : 'Original'}, ${opponentName} picked ${
              (opponentPool ?? chosenPool) === 'community' ? 'Community' : 'Original'
            } — pick the same one to start.`
          : showRetry
            ? "Still hasn't confirmed — try again?"
            : isReady
              ? `Waiting for ${opponentName}…`
              : 'Both players need to confirm ready.'}
      </p>

      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <PillButton style="ghost" onClick={onLeave}>
            Someone else
          </PillButton>
        </div>
        <div style={{ flex: 1 }}>
          {poolsMismatched && !showRetry ? (
            <PillButton
              onClick={() => {
                setIsReady(false)
                setPoolsMismatched(false)
              }}
            >
              Change pick
            </PillButton>
          ) : showRetry ? (
            <PillButton
              onClick={() => {
                setShowRetry(false)
                setRetryKey((k) => k + 1)
              }}
            >
              Retry
            </PillButton>
          ) : (
            <PillButton onClick={() => setIsReady(true)} disabled={isReady}>
              {isReady ? 'Waiting…' : 'Ready'}
            </PillButton>
          )}
        </div>
      </div>
    </Shell>
  )
}

function DetailRow({ label, value, showRule = true }: { label: string; value: string; showRule?: boolean }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontSize: 14 }}>
        <span style={{ color: 'var(--fb-text-3)' }}>{label}</span>
        <span style={{ color: 'var(--fb-text)' }}>{value}</span>
      </div>
      {showRule && <div style={{ height: 1, background: 'var(--fb-rule)' }} />}
    </div>
  )
}

function PoolOption({
  label,
  pool,
  chosenPool,
  onChoose,
  disabled,
}: {
  label: string
  pool: ContentPool
  chosenPool: ContentPool
  onChoose: (pool: ContentPool) => void
  disabled: boolean
}) {
  const isOn = chosenPool === pool
  return (
    <button
      onClick={() => onChoose(pool)}
      disabled={disabled}
      style={{
        flex: 1,
        padding: '10px 0',
        borderRadius: 11,
        fontSize: 13,
        fontWeight: 600,
        color: isOn ? 'var(--fb-accent-text)' : 'var(--fb-text-3)',
        background: isOn ? 'var(--fb-tint-row-bg)' : 'var(--fb-surface)',
        border: `1px solid ${isOn ? 'var(--fb-tint-row-border)' : 'var(--fb-border)'}`,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {label}
    </button>
  )
}
