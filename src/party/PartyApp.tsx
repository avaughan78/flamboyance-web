import { useEffect, useState } from 'react'
import type { DBAnimal, DBCollectiveNoun, DBCommunityNoun, DBGamePlayer, DBGameSession } from '../types'
import { ensureSignedIn, loadCommunityContent, loadContent } from '../game'
import { setCommunityTheme } from '../theme'
import { fetchGamePlayers, leaveGameSession } from './partyApi'
import { JoinParty } from './JoinParty'
import { PartyLobby } from './PartyLobby'
import { PartyQuestion } from './PartyQuestion'
import { PartyStandings } from './PartyStandings'
import { PartyResults } from './PartyResults'
import { FinalRoundBeat } from '../components/FinalRoundBeat'
import { Shell } from '../components/Shared'
import { PillButton } from '../components/PillButton'

type Phase = 'join' | 'lobby' | 'question' | 'standings' | 'finalRound' | 'results' | 'cancelled'

/** Top-level state machine for Party's non-host player experience —
 * mirrors DuelApp.tsx's pattern in its own isolated module. Web only ever
 * plays as a participant here, never as host (no create/start/advance
 * controls); a player who gets promoted mid-party sees an informational
 * note in PartyLobby rather than host UI, per the same scope boundary. */
export function PartyApp({ onBackToLanding }: { onBackToLanding: () => void }) {
  const [phase, setPhase] = useState<Phase>('join')
  const [userId, setUserId] = useState<string | null>(null)
  const [content, setContent] = useState<{ animals: DBAnimal[]; nouns: DBCollectiveNoun[] } | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [session, setSession] = useState<DBGameSession | null>(null)
  const [players, setPlayers] = useState<DBGamePlayer[]>([])
  const [communityNouns, setCommunityNouns] = useState<DBCommunityNoun[]>([])

  useEffect(() => {
    ensureSignedIn().then(setUserId)
    loadContent().then(setContent)
  }, [])

  // The session only carries a real content_pool once the host actually
  // starts the game (default is 'original' until then) — mirrors native's
  // per-screen ThemeManager.isCommunity sets (PartyQuestionView,
  // PartyStandingsView, PartyFinishedView all independently read
  // session/room.contentPool) but consolidated here since every phase
  // after 'lobby' shares the same `session` state.
  useEffect(() => {
    setCommunityTheme(session?.content_pool === 'community')
  }, [session?.content_pool])

  useEffect(() => {
    if (session?.content_pool === 'community' && communityNouns.length === 0) {
      loadCommunityContent()
        .then((c) => setCommunityNouns(c.nouns))
        .catch(() => {})
    }
  }, [session?.content_pool, communityNouns.length])

  async function refreshPlayers(id: string) {
    try {
      setPlayers(await fetchGamePlayers(id))
    } catch {
      // next poll/transition retries
    }
  }

  function resetToJoin() {
    setSessionId(null)
    setSession(null)
    setPlayers([])
    setCommunityNouns([])
    setCommunityTheme(false)
    setPhase('join')
  }

  async function handleLeave() {
    if (sessionId) await leaveGameSession(sessionId).catch(() => {})
    resetToJoin()
  }

  function handleJoined(id: string) {
    setSessionId(id)
    setPhase('lobby')
  }

  async function handleEnterGame(newSession: DBGameSession) {
    setSession(newSession)
    await refreshPlayers(newSession.id)
    setPhase('question')
  }

  async function handleGoToResults(finishedSession: DBGameSession) {
    setSession(finishedSession)
    setPhase('results')
  }

  function handleCancelled() {
    setPhase('cancelled')
  }

  // Shared routing decision for both Standings (normal host-advance) and
  // Question/Reveal (straggler recovery, when the party's moved on
  // without us) — both hand a freshly-polled session here and this
  // decides what's next purely from its status/index.
  async function routeForSession(fresh: DBGameSession) {
    setSession(fresh)
    if (fresh.status === 'cancelled') {
      setPhase('cancelled')
      return
    }
    if (fresh.status === 'completed' || fresh.current_question_index >= fresh.total_questions) {
      await refreshPlayers(fresh.id)
      setPhase('results')
      return
    }
    await refreshPlayers(fresh.id)
    const isFinalRoundNext = fresh.current_question_index === fresh.total_questions - 1
    setPhase(isFinalRoundNext ? 'finalRound' : 'question')
  }

  if (phase === 'join') {
    return <JoinParty onJoined={handleJoined} onBack={onBackToLanding} />
  }

  if (!sessionId) {
    return (
      <Shell>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ fontSize: 14, color: 'var(--fb-text-3)' }}>Loading…</p>
        </div>
      </Shell>
    )
  }

  if (phase === 'lobby') {
    return (
      <PartyLobby
        sessionId={sessionId}
        userId={userId ?? ''}
        onEnterGame={handleEnterGame}
        onGoToResults={handleGoToResults}
        onCancelled={handleCancelled}
        onLeave={handleLeave}
      />
    )
  }

  if (phase === 'cancelled') {
    return (
      <Shell>
        <div style={{ flex: 1 }} />
        <p style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.04em', textAlign: 'center', margin: 0 }}>
          Party ended
        </p>
        <p style={{ fontSize: 14, color: 'var(--fb-text-3)', textAlign: 'center', margin: 0 }}>
          The host ended this party.
        </p>
        <PillButton onClick={resetToJoin}>Done</PillButton>
        <div style={{ flex: 1 }} />
      </Shell>
    )
  }

  if (phase === 'results') {
    return <PartyResults sessionId={sessionId} userId={userId ?? ''} onDone={resetToJoin} />
  }

  if (!session || !content || !userId) {
    return (
      <Shell>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ fontSize: 14, color: 'var(--fb-text-3)' }}>Loading…</p>
        </div>
      </Shell>
    )
  }

  if (phase === 'finalRound') {
    return <FinalRoundBeat onComplete={() => setPhase('question')} />
  }

  if (phase === 'standings') {
    return (
      <PartyStandings session={session} players={players} userId={userId} onSessionChanged={routeForSession} onLeave={handleLeave} />
    )
  }

  return (
    <PartyQuestion
      session={session}
      content={content}
      communityNouns={communityNouns}
      onGoToStandings={() => setPhase('standings')}
      onSessionChanged={routeForSession}
      onLeave={handleLeave}
    />
  )
}
