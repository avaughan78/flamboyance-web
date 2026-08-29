import { useEffect, useRef, useState } from 'react'
import type { DBAnimal, DBCollectiveNoun, DBCommunityNoun, DBRoom, DBRoomPlayer } from '../types'
import { ensureSignedIn, fetchPlayers, fetchRoom, loadCommunityContent, loadContent } from '../game'
import { setCommunityTheme } from '../theme'
import { DuelHome } from './DuelHome'
import { DuelMatchmaking } from './DuelMatchmaking'
import { MatchFound } from './MatchFound'
import { DuelCountdown } from './DuelCountdown'
import { DuelQuestion } from './DuelQuestion'
import { FinalRoundBeat } from '../components/FinalRoundBeat'
import { DuelResult } from './DuelResult'
import { Shell } from '../components/Shared'
import type { DuelMatchResult } from './duelApi'

type Phase = 'home' | 'queued' | 'matchFound' | 'countdown' | 'playing' | 'finalRound' | 'result'

/** Top-level state machine for Duel, mirroring App.tsx's own pattern
 * (one owner of state/effects, presentational screens underneath) but
 * scoped entirely to its own module — the existing Party/room-join flow
 * in App.tsx is untouched. */
export function DuelApp({ onBackToParty }: { onBackToParty: () => void }) {
  const [phase, setPhase] = useState<Phase>('home')
  const [userId, setUserId] = useState<string | null>(null)
  const [content, setContent] = useState<{ animals: DBAnimal[]; nouns: DBCollectiveNoun[] } | null>(null)

  const [queueName, setQueueName] = useState('')
  const [preferredOpponentId, setPreferredOpponentId] = useState<string | null>(null)
  const [shareCode, setShareCode] = useState<string | null>(null)

  const [matchResult, setMatchResult] = useState<DuelMatchResult | null>(null)
  const [room, setRoom] = useState<DBRoom | null>(null)
  const [players, setPlayers] = useState<DBRoomPlayer[]>([])
  const [communityNouns, setCommunityNouns] = useState<DBCommunityNoun[]>([])
  const [communityEnabled, setCommunityEnabled] = useState(false)

  const roomRef = useRef<DBRoom | null>(null)
  roomRef.current = room

  useEffect(() => {
    ensureSignedIn().then(setUserId)
    loadContent().then(setContent)
    // Loaded eagerly (not lazily, like the room-triggered load below) since
    // this also gates whether MatchFound's picker shows Community as an
    // option at all — same kill-switch respect as native's
    // communityNounsEnabled gate on Party's host picker, just missing
    // until now on Duel specifically (a real, pre-existing gap on every
    // platform: MatchFoundView/MatchFoundScreen both showed the picker
    // unconditionally).
    loadCommunityContent()
      .then((c) => {
        setCommunityEnabled(c.enabled)
        if (c.enabled) setCommunityNouns(c.nouns)
      })
      .catch(() => {})
  }, [])

  // The room only carries an authoritative content_pool once both players
  // have agreed and the ready-gate flips it to 'active' — before that
  // (home/queued/matchFound), MatchFound owns the accent color itself via
  // its own live picker taps. Mirrors native's per-screen
  // ThemeManager.isCommunity sets (DuelCountdownView, QuestionView,
  // FinalRoundView, DuelResultView all independently read room.contentPool).
  useEffect(() => {
    if (phase === 'home' || phase === 'queued' || phase === 'matchFound') return
    setCommunityTheme(room?.content_pool === 'community')
  }, [phase, room?.content_pool])

  useEffect(() => {
    if (room?.content_pool === 'community' && communityNouns.length === 0) {
      loadCommunityContent()
        .then((c) => setCommunityNouns(c.nouns))
        .catch(() => {})
    }
  }, [room?.content_pool, communityNouns.length])

  async function refreshPlayers(roomId: string) {
    try {
      setPlayers(await fetchPlayers(roomId))
    } catch {
      // next poll/transition retries
    }
  }

  function resetToHome() {
    setRoom(null)
    setPlayers([])
    setMatchResult(null)
    setCommunityNouns([])
    setCommunityTheme(false)
    setPhase('home')
  }

  function handleStartQueue(displayName: string, opponentId: string | null, code: string | null) {
    setQueueName(displayName)
    setPreferredOpponentId(opponentId)
    setShareCode(code)
    setPhase('queued')
  }

  async function handleMatched(result: DuelMatchResult) {
    if (!result.room_id) return
    setMatchResult(result)
    const [fetchedRoom] = await Promise.all([fetchRoom(result.room_id), refreshPlayers(result.room_id)])
    setRoom(fetchedRoom)
    setPhase('matchFound')
  }

  async function handleReady(updatedRoom: DBRoom) {
    setRoom(updatedRoom)
    await refreshPlayers(updatedRoom.id)
    setPhase('countdown')
  }

  function handleRoundAdvanced(newRoom: DBRoom, isFinalRoundNext: boolean) {
    setRoom(newRoom);
    setPhase(isFinalRoundNext ? 'finalRound' : 'playing')
  }

  // Covers the case where the match resolves mid-round without either
  // player reaching the natural "last question -> Finish" path — an AFK
  // forfeit, most likely, since check_duel_afk_forfeit runs inside
  // advance-duel-round/mark-round-ready on every round transition.
  async function handleRoomUpdate(updatedRoom: DBRoom) {
    setRoom(updatedRoom)
    if (updatedRoom.status === 'finished') {
      await refreshPlayers(updatedRoom.id)
      setPhase('result')
    }
  }

  async function handleGameOver() {
    if (roomRef.current) await refreshPlayers(roomRef.current.id)
    setPhase('result')
  }

  if (phase === 'home') {
    return <DuelHome onStartQueue={handleStartQueue} onBack={onBackToParty} />
  }

  if (phase === 'queued') {
    return (
      <DuelMatchmaking
        displayName={queueName}
        preferredOpponentId={preferredOpponentId}
        shareCode={shareCode}
        currentUserId={userId}
        onMatched={handleMatched}
        onCancel={resetToHome}
      />
    )
  }

  if (!room || !content || !userId) {
    return (
      <Shell>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ fontSize: 14, color: 'var(--fb-text-3)' }}>Loading…</p>
        </div>
      </Shell>
    )
  }

  if (phase === 'matchFound') {
    return (
      <MatchFound
        room={room}
        opponentName={matchResult?.opponent_name ?? 'Opponent'}
        opponentRating={matchResult?.opponent_rating ?? 1000}
        yourRating={matchResult?.your_rating ?? 1000}
        communityEnabled={communityEnabled}
        onReady={handleReady}
        onLeave={resetToHome}
      />
    )
  }

  if (phase === 'countdown') {
    return <DuelCountdown onComplete={() => setPhase('playing')} />
  }

  if (phase === 'finalRound') {
    return <FinalRoundBeat onComplete={() => setPhase('playing')} />
  }

  if (phase === 'result') {
    return <DuelResult room={room} players={players} userId={userId} onDone={resetToHome} />
  }

  return (
    <DuelQuestion
      room={room}
      players={players}
      userId={userId}
      content={content}
      communityNouns={communityNouns}
      onRoundAdvanced={handleRoundAdvanced}
      onGameOver={handleGameOver}
      onRoomUpdate={handleRoomUpdate}
      onLeave={resetToHome}
    />
  )
}
