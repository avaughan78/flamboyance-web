import { useEffect, useState } from 'react'
import { Shell, Wordmark } from '../components/Shared'
import { PillButton } from '../components/PillButton'
import { fetchLeagueStandings, finishDuel, type DuelFinishResult, type LeagueStanding } from './duelApi'
import type { DBRoom, DBRoomPlayer } from '../types'

export function DuelResult({
  room,
  players,
  userId,
  onDone,
}: {
  room: DBRoom
  players: DBRoomPlayer[]
  userId: string
  onDone: () => void
}) {
  const [results, setResults] = useState<DuelFinishResult[] | null>(null)
  const [standings, setStandings] = useState<LeagueStanding[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    finishDuel(room.id)
      .then((r) => {
        if (cancelled) return
        setResults(r)
        fetchLeagueStandings()
          .then((s) => !cancelled && setStandings(s))
          .catch(() => {})
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't finalize the match — your score is still saved.")
      })
    return () => {
      cancelled = true
    }
  }, [room.id])

  const me = players.find((p) => p.user_id === userId)
  const opponent = players.find((p) => p.user_id !== userId)
  const mine = results?.find((r) => r.user_id === userId)

  const isForfeitWin = room.forfeited_user_id && room.forfeited_user_id !== userId
  const isForfeitLoss = room.forfeited_user_id === userId
  const wonByScore = !room.forfeited_user_id && (me?.score ?? 0) > (opponent?.score ?? 0)
  const drew = !room.forfeited_user_id && (me?.score ?? 0) === (opponent?.score ?? 0)
  const won = isForfeitWin || wonByScore

  const outcomeTitle = isForfeitLoss ? 'DUEL FORFEITED' : drew ? 'DRAW' : won ? 'DUEL WON' : 'DUEL LOST'

  if (!results && !error) {
    return (
      <Shell>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ fontSize: 14, color: 'var(--fb-text-3)' }}>Finishing up…</p>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div style={{ marginBottom: 4 }}>
        <Wordmark />
      </div>
      <div style={{ textAlign: 'center' }}>
        <p
          style={{
            fontSize: 30,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            margin: 0,
            color: won ? 'var(--fb-success-text)' : isForfeitLoss || !drew ? 'var(--fb-accent-text)' : 'var(--fb-text)',
          }}
        >
          {outcomeTitle}
        </p>
        {opponent && (
          <p style={{ fontSize: 13, color: 'var(--fb-text-3)', margin: '6px 0 0' }}>
            against {opponent.display_name}
            {mine ? ` · ${mine.rating_delta >= 0 ? '+' : ''}${mine.rating_delta} rating` : ''}
          </p>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <StatTile label="Score" value={me?.score?.toLocaleString() ?? '—'} />
        <StatTile label="Rating" value={mine ? String(mine.new_rating) : '—'} />
        <StatTile
          label="Change"
          value={mine ? `${mine.rating_delta >= 0 ? '+' : ''}${mine.rating_delta}` : '—'}
          accent={mine ? mine.rating_delta >= 0 : undefined}
        />
      </div>

      {error && <p style={{ fontSize: 13, color: 'var(--fb-accent)', margin: 0 }}>{error}</p>}

      {standings.length > 0 && (
        <div>
          <p className="fb-kicker" style={{ marginBottom: 10 }}>
            THIS WEEK'S LEAGUE
          </p>
          <div style={{ borderRadius: 16, border: '1px solid var(--fb-border)', background: 'var(--fb-surface)', overflow: 'hidden' }}>
            {standings.map((s, i) => (
              <div key={s.user_id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' }}>
                  <span style={{ width: 20, fontSize: 12, color: 'var(--fb-text-3)', fontVariantNumeric: 'tabular-nums' }}>
                    {i + 1}
                  </span>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {s.display_name}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--fb-text)' }}>
                    {s.points.toLocaleString()}
                  </span>
                </div>
                {i < standings.length - 1 && <div style={{ height: 1, background: 'var(--fb-rule)' }} />}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ flex: 1 }} />
      <PillButton onClick={onDone}>Done</PillButton>
    </Shell>
  )
}

function StatTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      style={{
        flex: 1,
        textAlign: 'center',
        padding: '14px 8px',
        borderRadius: 14,
        background: 'var(--fb-surface)',
        border: '1px solid var(--fb-border)',
      }}
    >
      <p
        style={{
          fontSize: 19,
          fontWeight: 700,
          margin: 0,
          fontVariantNumeric: 'tabular-nums',
          color: accent === undefined ? 'var(--fb-text)' : accent ? 'var(--fb-success-text)' : 'var(--fb-accent-text)',
        }}
      >
        {value}
      </p>
      <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fb-text-3)', margin: '4px 0 0' }}>
        {label}
      </p>
    </div>
  )
}
