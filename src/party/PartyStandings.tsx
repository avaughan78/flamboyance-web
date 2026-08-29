import { useEffect, useRef, useState } from 'react'
import type { DBGamePlayer, DBGameSession } from '../types'
import { checkStandingsArrival, fetchGamePlayers, fetchGameSession } from './partyApi'
import { Shell, LeaveButton, Avatar, RankBadge } from '../components/Shared'

const POLL_MS = 1000

export function PartyStandings({
  session,
  players: initialPlayers,
  userId,
  onSessionChanged,
  onLeave,
}: {
  session: DBGameSession
  players: DBGamePlayer[]
  userId: string
  onSessionChanged: (session: DBGameSession) => void
  onLeave: () => void
}) {
  const [players, setPlayers] = useState(initialPlayers)
  const [allArrived, setAllArrived] = useState(false)
  const onSessionChangedRef = useRef(onSessionChanged)
  onSessionChangedRef.current = onSessionChanged

  useEffect(() => {
    let cancelled = false
    const questionIndex = session.current_question_index

    async function pollPlayers() {
      try {
        const fresh = await fetchGamePlayers(session.id)
        if (!cancelled) setPlayers(fresh)
      } catch {
        // transient
      }
    }

    async function pollSession() {
      try {
        const fresh = await fetchGameSession(session.id)
        if (cancelled) return
        if (fresh.status === 'cancelled' || fresh.status === 'completed' || fresh.current_question_index !== questionIndex) {
          onSessionChangedRef.current(fresh)
        }
      } catch {
        // transient
      }
    }

    async function pollArrival() {
      try {
        const result = await checkStandingsArrival(session.id)
        if (!cancelled) setAllArrived(result.all_arrived)
      } catch {
        // transient
      }
    }

    pollPlayers()
    pollSession()
    pollArrival()
    const playersId = window.setInterval(pollPlayers, POLL_MS)
    const sessionId = window.setInterval(pollSession, POLL_MS)
    const arrivalId = window.setInterval(pollArrival, POLL_MS)

    return () => {
      cancelled = true
      window.clearInterval(playersId)
      window.clearInterval(sessionId)
      window.clearInterval(arrivalId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, session.current_question_index])

  const sorted = [...players].sort((a, b) => b.score - a.score)
  const host = players.find((p) => p.user_id === session.host_id)
  const hostDisconnected = host?.disconnected_at != null

  return (
    <Shell>
      <LeaveButton onClick={onLeave} />
      <div>
        <p className="fb-pair-top" style={{ fontSize: 30 }}>
          Round {session.current_question_index + 1}
        </p>
        <p className="fb-pair-bottom" style={{ fontSize: 30 }}>
          of {session.total_questions}
        </p>
      </div>

      <div style={{ borderRadius: 16, border: '1px solid var(--fb-border)', background: 'var(--fb-surface)', overflow: 'hidden' }}>
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
              <span
                style={{
                  fontSize: i === 0 ? 17 : i < 3 ? 16 : 15,
                  fontWeight: 600,
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {p.display_name}
              </span>
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
      <p style={{ fontSize: 12, color: 'var(--fb-text-3)', textAlign: 'center', margin: 0 }}>
        {hostDisconnected
          ? 'Host lost connection — nominating a new host…'
          : allArrived
            ? 'Waiting for the host to continue…'
            : 'Waiting for everyone to arrive…'}
      </p>
    </Shell>
  )
}
