import { useEffect, useRef, useState } from 'react'
import type { DBGamePlayer, DBGameSession } from '../types'
import { fetchGamePlayers, fetchGameSession, heartbeat, markReady } from './partyApi'
import { Shell, Avatar } from '../components/Shared'
import { PillButton } from '../components/PillButton'

const POLL_MS = 1000
const HEARTBEAT_MS = 5000

export function PartyLobby({
  sessionId,
  userId,
  onEnterGame,
  onGoToResults,
  onCancelled,
  onLeave,
}: {
  sessionId: string
  userId: string
  onEnterGame: (session: DBGameSession) => void
  onGoToResults: (session: DBGameSession) => void
  onCancelled: () => void
  onLeave: () => void
}) {
  const [session, setSession] = useState<DBGameSession | null>(null)
  const [players, setPlayers] = useState<DBGamePlayer[]>([])
  const [isMarkingReady, setIsMarkingReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const handledTransitionRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function pollSession() {
      try {
        const s = await fetchGameSession(sessionId)
        if (cancelled) return
        setSession(s)
        if (handledTransitionRef.current) return
        if (s.status === 'cancelled') {
          handledTransitionRef.current = true
          onCancelled()
        } else if (s.status === 'completed') {
          handledTransitionRef.current = true
          onGoToResults(s)
        } else if (s.status === 'playing' || s.status === 'final_round') {
          handledTransitionRef.current = true
          onEnterGame(s)
        }
      } catch {
        // transient — next tick retries
      }
    }

    async function pollPlayers() {
      try {
        setPlayers(await fetchGamePlayers(sessionId))
      } catch {
        // transient
      }
    }

    pollSession()
    pollPlayers()
    const sessionPollId = window.setInterval(pollSession, POLL_MS)
    const playersPollId = window.setInterval(pollPlayers, POLL_MS)
    const heartbeatId = window.setInterval(() => heartbeat(sessionId, 'waiting', 0), HEARTBEAT_MS)
    heartbeat(sessionId, 'waiting', 0)

    return () => {
      cancelled = true
      window.clearInterval(sessionPollId)
      window.clearInterval(playersPollId)
      window.clearInterval(heartbeatId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  async function handleMarkReady() {
    setIsMarkingReady(true)
    setError(null)
    try {
      await markReady(sessionId)
      setPlayers(await fetchGamePlayers(sessionId))
    } catch {
      setError('Something went wrong — try again.')
    } finally {
      setIsMarkingReady(false)
    }
  }

  if (!session) {
    return (
      <Shell>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ fontSize: 14, color: 'var(--fb-text-3)' }}>Loading…</p>
        </div>
      </Shell>
    )
  }

  const isHost = session.host_id === userId
  const me = players.find((p) => p.user_id === userId)
  const amReady = me?.ready_at != null
  const host = players.find((p) => p.user_id === session.host_id)
  const hostDisconnected = host?.disconnected_at != null

  return (
    <Shell>
      <div className="fb-tint-card" style={{ textAlign: 'center' }}>
        <p className="fb-kicker" style={{ marginBottom: 8 }}>
          ANYONE CAN JOIN WITH
        </p>
        <p style={{ fontSize: 34, fontWeight: 600, letterSpacing: 6, margin: 0, color: 'var(--fb-accent-text)' }}>
          {session.game_code}
        </p>
      </div>

      <p className="fb-kicker" style={{ marginBottom: -4 }}>
        PLAYERS READY
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {players.map((p) => (
          <div key={p.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar initial={p.display_name.slice(0, 1)} emphasized={p.user_id === session.host_id} />
            <span style={{ fontSize: 15, fontWeight: 500, flex: 1 }}>
              {p.display_name}
              {p.user_id === session.host_id && (
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--fb-accent-mid)', marginLeft: 6 }}>host</span>
              )}
            </span>
            {p.ready_at ? (
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fb-accent)' }}>✓ ready</span>
            ) : (
              <span style={{ fontSize: 11, color: 'var(--fb-text-4)' }}>waiting…</span>
            )}
          </div>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      {isHost ? (
        // Web only ever supports playing as a non-host — if this player
        // gets promoted (host disconnected, reap picked them), there's no
        // Start Game control here yet. Surface that plainly rather than
        // silently doing nothing.
        <p style={{ fontSize: 13, color: 'var(--fb-text-3)', textAlign: 'center' }}>
          You're the host now, but starting a party isn't supported on web yet — ask another player to host, or continue on the app.
        </p>
      ) : amReady ? (
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--fb-accent)', textAlign: 'center' }}>✓ You're ready!</p>
      ) : (
        <PillButton onClick={handleMarkReady} disabled={isMarkingReady}>
          {isMarkingReady ? 'Marking ready…' : 'Mark Ready'}
        </PillButton>
      )}

      {error && <p style={{ fontSize: 13, color: 'var(--fb-accent)', textAlign: 'center', margin: '8px 0 0' }}>{error}</p>}

      {!isHost && (
        <p style={{ fontSize: 12, color: 'var(--fb-text-3)', textAlign: 'center', margin: '8px 0 0' }}>
          {hostDisconnected ? 'Host lost connection — nominating a new host…' : 'Waiting for the host…'}
        </p>
      )}

      <PillButton style="text" onClick={onLeave}>
        Leave
      </PillButton>
    </Shell>
  )
}
