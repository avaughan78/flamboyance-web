import { useEffect, useState } from 'react'
import type { DBGamePlayer } from '../types'
import { fetchGamePlayers } from './partyApi'
import { Shell, Avatar, RankBadge } from '../components/Shared'
import { ConfettiBurst } from '../components/ConfettiBurst'
import { PillButton } from '../components/PillButton'

export function PartyResults({
  sessionId,
  userId,
  onDone,
}: {
  sessionId: string
  userId: string
  onDone: () => void
}) {
  const [players, setPlayers] = useState<DBGamePlayer[] | null>(null)

  useEffect(() => {
    fetchGamePlayers(sessionId).then(setPlayers).catch(() => setPlayers([]))
  }, [sessionId])

  if (!players) {
    return (
      <Shell>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ fontSize: 14, color: 'var(--fb-text-3)' }}>Loading…</p>
        </div>
      </Shell>
    )
  }

  const sorted = [...players].sort((a, b) => b.score - a.score)

  return (
    <Shell>
      <ConfettiBurst />
      <div style={{ flex: 1 }} />
      <div>
        <p className="fb-pair-top" style={{ fontSize: 34, textAlign: 'center' }}>
          Final
        </p>
        <p className="fb-pair-bottom" style={{ fontSize: 34, textAlign: 'center' }}>
          results
        </p>
      </div>
      <div style={{ marginTop: 12, borderRadius: 16, border: '1px solid var(--fb-border)', background: 'var(--fb-surface)', overflow: 'hidden' }}>
        {sorted.map((p, i) => (
          <div key={p.user_id}>
            <div
              className="fb-row-in"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '13px 14px',
                background: i === 0 ? 'var(--fb-tint-row-bg)' : 'transparent',
                animationDelay: `${i * 50}ms`,
              }}
            >
              <RankBadge rank={i + 1} />
              <Avatar initial={p.display_name.slice(0, 1)} emphasized={p.user_id === userId || i === 0} size={i < 3 ? 38 : 32} />
              <span style={{ fontSize: i === 0 ? 17 : i < 3 ? 16 : 15, fontWeight: 600, flex: 1 }}>{p.display_name}</span>
              {p.user_id === userId && (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    color: 'var(--fb-accent-mid)',
                    border: '1px solid var(--fb-accent-mid)',
                    borderRadius: 999,
                    padding: '3px 6px',
                  }}
                >
                  YOU
                </span>
              )}
              <span
                style={{
                  fontSize: i === 0 ? 22 : i < 3 ? 19 : 16,
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                  color: i === 0 ? 'var(--fb-accent-text)' : 'var(--fb-text)',
                }}
              >
                {p.score.toLocaleString()}
              </span>
            </div>
            {i < sorted.length - 1 && <div style={{ height: 1, background: 'var(--fb-rule)' }} />}
          </div>
        ))}
      </div>
      <div style={{ flex: 1 }} />
      <PillButton onClick={onDone}>Done</PillButton>
    </Shell>
  )
}
