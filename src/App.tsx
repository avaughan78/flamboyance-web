import { useEffect, useMemo, useRef, useState } from 'react'
import type { DBAnimal, DBCollectiveNoun, DBRoom, DBRoomPlayer, SubmitAnswerResponse } from './types'
import {
  cancelRoom,
  leaveRoom,
  leaveRoomOnUnload,
  choices,
  ensureSignedIn,
  etymology as lookupEtymology,
  fetchExistingAnswer,
  fetchRoundAnswers,
  indefiniteArticle,
  joinRoom,
  loadContent,
  nounText as lookupNounText,
  observePlayers,
  observeRoom,
  submitAnswer,
  unlockCard,
} from './game'
import { AnswerRow, answerRowState } from './components/AnswerRow'
import { PillButton } from './components/PillButton'

// Mirrors the native app's toolbar leave button (SF Symbol
// "rectangle.portrait.and.arrow.right") — an exit-door glyph, since there's
// no icon library here to draw from.
function LeaveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Leave"
      style={{
        alignSelf: 'flex-end',
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        color: 'var(--fb-text-3)',
        display: 'flex',
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
    </button>
  )
}

// Mirrors CountdownRing.swift in the native app — a big circular countdown
// instead of a plain "0:07". secondsRemaining only ticks once a second, but
// the CSS transition on strokeDashoffset animates each step smoothly into
// the next, so the ring reads as continuously draining rather than jumping.
function CountdownRing({
  secondsRemaining,
  totalSeconds,
  size = 56,
}: {
  secondsRemaining: number
  totalSeconds: number
  size?: number
}) {
  const radius = (size - 4) / 2
  const circumference = 2 * Math.PI * radius
  const progress = secondsRemaining / totalSeconds
  const isUrgent = secondsRemaining <= 3
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--fb-rule)" strokeWidth={4} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={isUrgent ? 'var(--fb-accent)' : 'var(--fb-accent-text)'}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size * 0.36,
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          color: isUrgent ? 'var(--fb-accent)' : 'var(--fb-text)',
        }}
      >
        {secondsRemaining}
      </div>
    </div>
  )
}

function codeFromUrl(): string {
  return new URLSearchParams(window.location.search).get('code')?.toUpperCase() ?? ''
}

// Mirrors QuestionView's roundDuration in the native app — a shared,
// server-timed countdown from `room.question_started_at` so both clients
// converge on the same instant instead of each one starting whenever its
// own view happened to appear.
const ROUND_DURATION = 12

export default function App() {
  const [room, setRoom] = useState<DBRoom | null>(null)
  const [players, setPlayers] = useState<DBRoomPlayer[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [content, setContent] = useState<{ animals: DBAnimal[]; nouns: DBCollectiveNoun[] } | null>(null)

  const [selected, setSelected] = useState<string | null>(null)
  const [result, setResult] = useState<SubmitAnswerResponse | null>(null)
  const [viewingResults, setViewingResults] = useState(false)
  const [options, setOptions] = useState<string[]>([])
  const [correctAnimal, setCorrectAnimal] = useState('')
  const [nounText, setNounText] = useState('')
  const [secondsRemaining, setSecondsRemaining] = useState(ROUND_DURATION)
  const [roundPoints, setRoundPoints] = useState<Record<string, number>>({})

  const roomRef = useRef<DBRoom | null>(null)
  roomRef.current = room

  // Closing the tab mid-party used to leave the player's row in
  // room_players forever — no button tap, no chance to run the normal
  // async leaveRoom(). Best-effort only; see leaveRoomOnUnload's own note.
  useEffect(() => {
    const handler = () => {
      if (roomRef.current) leaveRoomOnUnload(roomRef.current.id)
    }
    window.addEventListener('pagehide', handler)
    return () => window.removeEventListener('pagehide', handler)
  }, [])

  useEffect(() => {
    if (!room) return
    const stopRoom = observeRoom(room.id, (updated) => setRoom(updated))
    const stopPlayers = observePlayers(room.id, setPlayers)
    return () => {
      stopRoom()
      stopPlayers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id])

  // Whenever the room moves to a new live question, forget the previous
  // round's local answer state and figure out fresh options for this one.
  useEffect(() => {
    if (!room || room.status !== 'active' || !content || !userId) return
    const nounId = room.question_ids[room.current_question_index]
    if (!nounId) return

    setViewingResults(false)
    const picked = choices(content.animals, content.nouns, nounId)
    setCorrectAnimal(picked.correct)
    setOptions(picked.options)
    setNounText(lookupNounText(content.nouns, nounId))
    setSelected(null)
    setResult(null)

    fetchExistingAnswer(room.id, room.current_question_index, userId).then((existing) => {
      if (existing) {
        setSelected(existing.submitted_noun)
        setResult({ is_correct: existing.is_correct, points_awarded: 0 })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.status, room?.current_question_index, content, userId])

  // Whoever hasn't answered when the countdown hits zero is auto-submitted
  // as a miss, through the same handleAnswer path as a normal wrong tap.
  useEffect(() => {
    if (!room || room.status !== 'active' || selected) return
    const startedAt = new Date(room.question_started_at).getTime()
    const tick = () => {
      const elapsed = (Date.now() - startedAt) / 1000
      const remaining = Math.max(0, ROUND_DURATION - Math.floor(elapsed))
      setSecondsRemaining(remaining)
      if (remaining === 0) {
        handleAnswer('No answer')
      }
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.status, room?.current_question_index, selected])

  // Fetched once on entering the standings screen — this page is read-only
  // for a web guest (no advance/gate logic, unlike the host-side native
  // screen), so a live poll would be overkill.
  useEffect(() => {
    if (!room || !viewingResults) return
    fetchRoundAnswers(room.id, room.current_question_index).then(setRoundPoints).catch(() => {})
  }, [viewingResults, room?.id, room?.current_question_index])

  async function handleJoin(code: string, displayName: string) {
    // joinRoom already calls ensureSignedIn() internally — calling it again
    // here in parallel raced two concurrent signInAnonymously() calls,
    // which could leave the browser's session pointed at a different user
    // than the one just inserted into room_players, silently orphaning the
    // join. Awaiting joinRoom first guarantees a session already exists by
    // the time this resolves, so it's just a cheap cached-session read.
    const [joinedRoom, loadedContent] = await Promise.all([joinRoom(code, displayName), loadContent()])
    const uid = await ensureSignedIn()
    setUserId(uid)
    setContent(loadedContent)
    setRoom(joinedRoom)
  }

  async function handleAnswer(option: string) {
    if (!room || selected) return
    const questionIndex = room.current_question_index
    const nounId = room.question_ids[questionIndex]
    setSelected(option)
    try {
      const response = await submitAnswer(room.id, questionIndex, option)
      // The host may have already advanced the room by the time this
      // resolves — if so, the reset effect has moved on to a new question
      // and this late response must not overwrite its state.
      if (roomRef.current?.current_question_index === questionIndex) {
        setResult(response)
        if (response.is_correct && nounId) {
          unlockCard(nounId).catch(() => {})
        }
      }
    } catch {
      if (roomRef.current?.current_question_index === questionIndex) {
        setSelected(null)
      }
    }
  }

  // Mirrors QuestionView's forfeit() in the native app — a guest just
  // leaves, but the host ending it here ends it for everyone else too, so
  // that's called out explicitly before confirming.
  function handleLeave() {
    if (!room) return
    const isHost = userId === room.host_id
    const message = isHost
      ? 'Leaving now forfeits the rest of this game and ends it for everyone else too.'
      : 'Leaving now forfeits the rest of this game.'
    if (!window.confirm(message)) return
    if (isHost) {
      cancelRoom(room.id).finally(() => setRoom(null))
    } else {
      // Without this, the departing player's row stayed in room_players
      // forever: still shown to everyone else as present, and blocking
      // that same player from ever rejoining.
      leaveRoom(room.id).finally(() => setRoom(null))
    }
  }

  const etymologyForCurrentQuestion = useMemo(() => {
    if (!room || !content) return null
    const nounId = room.question_ids[room.current_question_index]
    return nounId ? lookupEtymology(content.nouns, nounId) : null
  }, [room, content])

  if (!room) {
    return <JoinScreen onJoin={handleJoin} />
  }

  if (room.status === 'lobby') {
    return <LobbyScreen room={room} players={players} />
  }

  if (room.status === 'finished') {
    return <FinishedScreen players={players} currentUserId={userId} />
  }

  // Without this, a non-host player whose host ends the party mid-round just
  // sat on whatever screen they were on forever — nothing else here ever
  // reacts to a status change other than 'lobby'/'finished'. Mirrors the
  // native app's "Party ended" alert.
  if (room.status === 'cancelled') {
    return <CancelledScreen onDone={() => setRoom(null)} />
  }

  if (viewingResults) {
    return (
      <RoundResultsScreen
        players={players}
        questionIndex={room.current_question_index}
        totalQuestions={room.question_ids.length}
        currentUserId={userId}
        roundPoints={roundPoints}
        onBack={() => setViewingResults(false)}
        onLeave={handleLeave}
      />
    )
  }

  if (result) {
    return (
      <RevealScreen
        isCorrect={result.is_correct}
        pointsAwarded={result.points_awarded}
        animalPlural={correctAnimal}
        correctNoun={nounText}
        etymology={etymologyForCurrentQuestion}
        onNext={() => setViewingResults(true)}
        onLeave={handleLeave}
      />
    )
  }

  return (
    <QuestionScreen
      questionIndex={room.current_question_index}
      totalQuestions={room.question_ids.length}
      noun={nounText}
      options={options}
      selected={selected}
      onSelect={handleAnswer}
      secondsRemaining={secondsRemaining}
      onLeave={handleLeave}
    />
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        padding: 20,
        gap: 18,
        maxWidth: 480,
        margin: '0 auto',
      }}
    >
      {children}
    </div>
  )
}

function Wordmark() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <img src={`${import.meta.env.BASE_URL}flamingo.png`} alt="" style={{ height: 26, width: 'auto' }} />
      <span style={{ fontSize: 15, fontWeight: 600 }}>Flamboyance</span>
    </div>
  )
}

function JoinScreen({ onJoin }: { onJoin: (code: string, name: string) => Promise<void> }) {
  const [code, setCode] = useState(codeFromUrl())
  const [name, setName] = useState('')
  const [isJoining, setIsJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!code.trim() || !name.trim()) {
      setError('Enter your name and the room code.')
      return
    }
    setError(null)
    setIsJoining(true)
    try {
      await onJoin(code.trim(), name.trim())
    } catch {
      setError("Couldn't find that room — check the code and try again.")
      setIsJoining(false)
    }
  }

  return (
    <Shell>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 22 }}>
        <div>
          <div style={{ marginBottom: 10 }}>
            <Wordmark />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.04em', margin: 0, lineHeight: 1.1 }}>
            Join a party
          </h1>
          <p style={{ fontSize: 14, color: 'var(--fb-text-3)', margin: '8px 0 0' }}>
            Someone on iPhone started a room — pop in your name and the code they gave you.
          </p>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fb-text-3)' }}>YOUR NAME</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What should we call you?"
            style={inputStyle}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fb-text-3)' }}>ROOM CODE</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="7FQ2"
            maxLength={4}
            style={{ ...inputStyle, letterSpacing: 6, fontWeight: 600 }}
          />
        </label>

        {error && <p style={{ fontSize: 13, color: 'var(--fb-accent)', margin: 0 }}>{error}</p>}

        <PillButton onClick={submit} disabled={isJoining}>
          {isJoining ? 'Joining…' : 'Join Party'}
        </PillButton>
      </div>
    </Shell>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '14px 16px',
  borderRadius: 11,
  background: 'var(--fb-surface)',
  border: '1px solid var(--fb-border)',
  color: 'var(--fb-text)',
  fontSize: 16,
  outline: 'none',
}

function LobbyScreen({ room, players }: { room: DBRoom; players: DBRoomPlayer[] }) {
  return (
    <Shell>
      <div className="fb-tint-card" style={{ textAlign: 'center' }}>
        <p className="fb-kicker" style={{ marginBottom: 8 }}>
          ANYONE CAN JOIN WITH
        </p>
        <p style={{ fontSize: 34, fontWeight: 600, letterSpacing: 6, margin: 0, color: 'var(--fb-accent-text)' }}>
          {room.code}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {players.map((p) => (
          <div key={p.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar initial={p.display_name.slice(0, 1)} />
            <span style={{ fontSize: 15, fontWeight: 500 }}>{p.display_name}</span>
          </div>
        ))}
      </div>

      <div style={{ flex: 1 }} />
      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--fb-text-3)', textAlign: 'center' }}>
        Waiting for the host to start…
      </p>
    </Shell>
  )
}

function Avatar({ initial, emphasized = false, size = 32 }: { initial: string; emphasized?: boolean; size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: '50%',
        background: emphasized ? 'var(--fb-tint-row-bg)' : 'var(--fb-surface)',
        border: `1px solid ${emphasized ? 'var(--fb-tint-row-border)' : 'var(--fb-border)'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.4,
        fontWeight: 600,
        color: emphasized ? 'var(--fb-accent-text)' : 'var(--fb-text-3)',
      }}
    >
      {initial}
    </div>
  )
}

function QuestionScreen({
  questionIndex,
  totalQuestions,
  noun,
  options,
  selected,
  onSelect,
  secondsRemaining,
  onLeave,
}: {
  questionIndex: number
  totalQuestions: number
  noun: string
  options: string[]
  selected: string | null
  onSelect: (option: string) => void
  secondsRemaining: number
  onLeave: () => void
}) {
  return (
    <Shell>
      <LeaveButton onClick={onLeave} />
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <span style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>
            Question {questionIndex + 1} of {totalQuestions}
          </span>
          <CountdownRing secondsRemaining={secondsRemaining} totalSeconds={ROUND_DURATION} size={44} />
        </div>
        <div style={{ height: 3, borderRadius: 999, background: 'var(--fb-rule)', marginTop: 8, overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${(questionIndex / Math.max(totalQuestions, 1)) * 100}%`,
              background: 'var(--fb-accent)',
            }}
          />
        </div>
      </div>

      <div>
        <p className="fb-pair-top" style={{ fontSize: 32 }}>
          <span style={{ color: 'var(--fb-text-faint)' }}>{indefiniteArticle(noun)} </span>
          {noun.toLowerCase()}
        </p>
        <p className="fb-pair-bottom" style={{ fontSize: 32 }}>
          of ______
        </p>
      </div>

      {/* The animal is the secret to be guessed here — no illustration,
          name, or placeholder can appear until RevealScreen, matching the
          design reference exactly (no image slot appears on any question
          screen there). */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {options.map((option) => (
          <AnswerRow key={option} text={option} state={answerRowState(option, selected)} onClick={() => onSelect(option)} />
        ))}
      </div>

      {/* Real flexible space lives here, below the options, not between the
          blank and the options — matching the design, where the options
          sit close under the blank and the empty space collects beneath. */}
      <div style={{ flex: 1 }} />
    </Shell>
  )
}

function RevealScreen({
  isCorrect,
  pointsAwarded,
  animalPlural,
  correctNoun,
  etymology,
  onNext,
  onLeave,
}: {
  isCorrect: boolean
  pointsAwarded: number
  animalPlural: string
  correctNoun: string
  etymology: string | null
  onNext: () => void
  onLeave: () => void
}) {
  return (
    <Shell>
      <LeaveButton onClick={onLeave} />
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div
          style={{
            width: 38,
            height: 38,
            minWidth: 38,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: isCorrect ? 'var(--fb-tint-success-bg)' : 'transparent',
            border: `1.5px solid ${isCorrect ? 'var(--fb-tint-success-border)' : 'var(--fb-border-strong)'}`,
            color: isCorrect ? 'var(--fb-success-text)' : 'var(--fb-text-4)',
            fontSize: 16,
          }}
        >
          {isCorrect ? '✓' : '✕'}
        </div>
        <div>
          <p style={{ fontSize: 17, fontWeight: 500, margin: 0 }}>{isCorrect ? 'Correct' : 'Not this time'}</p>
          {isCorrect && (
            <p style={{ fontSize: 12, color: 'var(--fb-text-3)', margin: '3px 0 0' }}>+{pointsAwarded}</p>
          )}
        </div>
      </div>

      <div className={isCorrect ? 'fb-tint-card success' : 'fb-tint-card'}>
        <p className="fb-kicker" style={{ marginBottom: 10, color: isCorrect ? 'var(--fb-success-text)' : undefined }}>
          THE WORD
        </p>
        <p className="fb-pair-top on-tint" style={{ fontSize: 40 }}>
          <span style={{ color: isCorrect ? 'var(--fb-success-faint)' : 'var(--fb-accent-faint)' }}>
            {indefiniteArticle(correctNoun)}{' '}
          </span>
          {correctNoun.toLowerCase()}
        </p>
        <p className="fb-pair-bottom on-tint" style={{ fontSize: 40 }}>
          of {animalPlural.toLowerCase()}
        </p>
      </div>

      {etymology && (
        <div>
          <div className="fb-fading-rule" style={{ marginBottom: 12 }} />
          <p className="fb-kicker" style={{ marginBottom: 8 }}>
            WHERE IT COMES FROM
          </p>
          <p style={{ fontSize: 15, lineHeight: 1.65, color: 'var(--fb-text-2)', margin: 0 }}>{etymology}</p>
        </div>
      )}

      <div style={{ flex: 1 }} />
      <PillButton onClick={onNext}>See leaderboard</PillButton>
    </Shell>
  )
}

// Mirrors ResultsView.rankBadge in the native app — a crown for 1st, a
// numbered medal circle for 2nd/3rd, plain rank text below that.
function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span style={{ width: 24, display: 'flex', justifyContent: 'center', color: 'var(--fb-accent-text)' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M2 18h20l-1.6-9-4.9 4.3L12 6.5l-3.5 6.8L3.6 9z" />
        </svg>
      </span>
    )
  }
  if (rank <= 3) {
    return (
      <span
        style={{
          width: 22,
          height: 22,
          flexShrink: 0,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 700,
          color: 'var(--fb-text-2)',
          background: 'var(--fb-surface)',
          border: '1px solid var(--fb-border-strong)',
        }}
      >
        {rank}
      </span>
    )
  }
  return (
    <span style={{ width: 24, textAlign: 'center', fontSize: 12, color: 'var(--fb-text-3)', fontVariantNumeric: 'tabular-nums' }}>
      {String(rank).padStart(2, '0')}
    </span>
  )
}

// Mirrors ResultsView.rankedRow — one table for every player count, with
// 1st/2nd/3rd escalating in size and getting the medal badge instead of a
// separate podium block.
function RankedRow({
  index,
  player,
  isMe,
  roundPoints,
}: {
  index: number
  player: DBRoomPlayer
  isMe: boolean
  roundPoints: Record<string, number>
}) {
  const rank = index + 1
  const isTopThree = rank <= 3
  const isLeader = rank === 1
  const avatarSize = isTopThree ? 38 : 32
  const nameSize = isLeader ? 17 : isTopThree ? 16 : 15
  const scoreSize = isLeader ? 22 : isTopThree ? 19 : 16
  const gained = roundPoints[player.user_id]

  return (
    <div
      className="fb-row-in"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '13px 14px',
        background: isLeader ? 'var(--fb-tint-row-bg)' : 'transparent',
        animationDelay: `${index * 50}ms`,
      }}
    >
      <RankBadge rank={rank} />
      <Avatar initial={player.display_name.slice(0, 1)} emphasized={isMe || isLeader} size={avatarSize} />
      <span style={{ fontSize: nameSize, fontWeight: 600 }}>{player.display_name}</span>
      {isMe && (
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
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
        <span
          style={{
            fontSize: scoreSize,
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            color: isLeader ? 'var(--fb-accent-text)' : 'var(--fb-text)',
          }}
        >
          {player.score.toLocaleString()}
        </span>
        {!!gained && gained > 0 && (
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--fb-success-text)', fontVariantNumeric: 'tabular-nums' }}>
            +{gained}
          </span>
        )}
      </div>
    </div>
  )
}

function RoundResultsScreen({
  players,
  questionIndex,
  totalQuestions,
  currentUserId,
  roundPoints,
  onBack,
  onLeave,
}: {
  players: DBRoomPlayer[]
  questionIndex: number
  totalQuestions: number
  currentUserId: string | null
  roundPoints: Record<string, number>
  onBack: () => void
  onLeave: () => void
}) {
  return (
    <Shell>
      <LeaveButton onClick={onLeave} />
      <div>
        <p className="fb-pair-top" style={{ fontSize: 30 }}>
          Round {questionIndex + 1}
        </p>
        <p className="fb-pair-bottom" style={{ fontSize: 30 }}>
          of {totalQuestions}
        </p>
      </div>
      <div style={{ borderRadius: 16, border: '1px solid var(--fb-border)', background: 'var(--fb-surface)', overflow: 'hidden' }}>
        {players.map((p, i) => (
          <div key={p.user_id}>
            <RankedRow index={i} player={p} isMe={p.user_id === currentUserId} roundPoints={roundPoints} />
            {i < players.length - 1 && <div style={{ height: 1, background: 'var(--fb-rule)' }} />}
          </div>
        ))}
      </div>
      <div style={{ flex: 1 }} />
      <p style={{ fontSize: 12, color: 'var(--fb-text-3)', textAlign: 'center', margin: '0 0 14px' }}>
        {questionIndex + 1 >= totalQuestions ? 'Waiting for the host to finish…' : 'Waiting for the host…'}
      </p>
      <PillButton style="ghost" onClick={onBack}>
        Back to question
      </PillButton>
    </Shell>
  )
}

function CancelledScreen({ onDone }: { onDone: () => void }) {
  return (
    <Shell>
      <div style={{ flex: 1 }} />
      <p style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.04em', textAlign: 'center', margin: 0 }}>
        Party ended
      </p>
      <p style={{ fontSize: 14, color: 'var(--fb-text-3)', textAlign: 'center', margin: 0 }}>
        The host ended this party.
      </p>
      <PillButton onClick={onDone}>Done</PillButton>
      <div style={{ flex: 1 }} />
    </Shell>
  )
}

function FinishedScreen({ players, currentUserId }: { players: DBRoomPlayer[]; currentUserId: string | null }) {
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
      <div style={{ marginTop: 12 }}>
        <div style={{ borderRadius: 16, border: '1px solid var(--fb-border)', background: 'var(--fb-surface)', overflow: 'hidden' }}>
          {players.map((p, i) => (
            <div key={p.user_id}>
              <RankedRow index={i} player={p} isMe={p.user_id === currentUserId} roundPoints={{}} />
              {i < players.length - 1 && <div style={{ height: 1, background: 'var(--fb-rule)' }} />}
            </div>
          ))}
        </div>
      </div>
      <div style={{ flex: 1 }} />
    </Shell>
  )
}

// A lightweight CSS-only confetti burst — plain divs falling via a CSS
// animation rather than JS-driven positions, mirroring ConfettiView.swift's
// one-shot celebration on the native app's equivalent screen.
function ConfettiBurst() {
  const palette = ['var(--fb-accent)', 'var(--fb-accent-bright)', 'var(--fb-success-bright)', '#ffd45a']
  const pieces = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    color: palette[Math.floor(Math.random() * palette.length)],
    delay: Math.random() * 0.5,
    duration: 1.8 + Math.random() * 1.1,
    drift: Math.random() * 120 - 60,
    rotate: Math.random() * 540 - 270,
    width: 6 + Math.random() * 4,
    height: 8 + Math.random() * 6,
  }))
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {pieces.map((p) => (
        <div
          key={p.id}
          style={
            {
              position: 'absolute',
              top: -20,
              left: `${p.left}%`,
              width: p.width,
              height: p.height,
              background: p.color,
              animation: `fb-confetti-fall ${p.duration}s ease-in ${p.delay}s forwards`,
              '--fb-confetti-drift': `${p.drift}px`,
              '--fb-confetti-rotate': `${p.rotate}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}
