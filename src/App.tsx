import { useEffect, useMemo, useRef, useState } from 'react'
import type { DBAnimal, DBCollectiveNoun, DBRoom, DBRoomPlayer, SubmitAnswerResponse } from './types'
import {
  animalName as lookupAnimalName,
  choices,
  ensureSignedIn,
  etymology as lookupEtymology,
  fetchExistingAnswer,
  joinRoom,
  loadContent,
  observePlayers,
  observeRoom,
  submitAnswer,
  unlockCard,
} from './game'
import { AnimalIllustration } from './components/AnimalIllustration'
import { AnswerRow, answerRowState } from './components/AnswerRow'
import { PillButton } from './components/PillButton'

function codeFromUrl(): string {
  return new URLSearchParams(window.location.search).get('code')?.toUpperCase() ?? ''
}

export default function App() {
  const [room, setRoom] = useState<DBRoom | null>(null)
  const [players, setPlayers] = useState<DBRoomPlayer[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [content, setContent] = useState<{ animals: DBAnimal[]; nouns: DBCollectiveNoun[] } | null>(null)

  const [selected, setSelected] = useState<string | null>(null)
  const [result, setResult] = useState<SubmitAnswerResponse | null>(null)
  const [viewingResults, setViewingResults] = useState(false)
  const [options, setOptions] = useState<string[]>([])
  const [correctText, setCorrectText] = useState('')

  const roomRef = useRef<DBRoom | null>(null)
  roomRef.current = room

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
    const picked = choices(content.nouns, nounId)
    setCorrectText(picked.correct)
    setOptions(picked.options)
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

  async function handleJoin(code: string, displayName: string) {
    const [joinedRoom, uid, loadedContent] = await Promise.all([joinRoom(code, displayName), ensureSignedIn(), loadContent()])
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

  const animalNameForCurrentQuestion = useMemo(() => {
    if (!room || !content) return ''
    const nounId = room.question_ids[room.current_question_index]
    return nounId ? lookupAnimalName(content.animals, content.nouns, nounId) : ''
  }, [room, content])

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
    return <FinishedScreen players={players} />
  }

  if (viewingResults) {
    return (
      <RoundResultsScreen
        players={players}
        questionIndex={room.current_question_index}
        totalQuestions={room.question_ids.length}
        onBack={() => setViewingResults(false)}
      />
    )
  }

  if (result) {
    return (
      <RevealScreen
        isCorrect={result.is_correct}
        pointsAwarded={result.points_awarded}
        animalName={animalNameForCurrentQuestion}
        correctNoun={correctText}
        etymology={etymologyForCurrentQuestion}
        onNext={() => setViewingResults(true)}
      />
    )
  }

  return (
    <QuestionScreen
      questionIndex={room.current_question_index}
      totalQuestions={room.question_ids.length}
      animalName={animalNameForCurrentQuestion}
      options={options}
      selected={selected}
      onSelect={handleAnswer}
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

function Avatar({ initial, emphasized = false }: { initial: string; emphasized?: boolean }) {
  return (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        background: emphasized ? 'var(--fb-tint-row-bg)' : 'var(--fb-surface)',
        border: `1px solid ${emphasized ? 'var(--fb-tint-row-border)' : 'var(--fb-border)'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
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
  animalName,
  options,
  selected,
  onSelect,
}: {
  questionIndex: number
  totalQuestions: number
  animalName: string
  options: string[]
  selected: string | null
  onSelect: (option: string) => void
}) {
  return (
    <Shell>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--fb-text-3)' }}>
          <span>
            Question {questionIndex + 1} of {totalQuestions}
          </span>
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

      <div style={{ textAlign: 'center' }}>
        <p className="fb-pair-top" style={{ fontSize: 32 }}>
          a
        </p>
        <p className="fb-pair-bottom" style={{ fontSize: 32 }}>
          {animalName.toLowerCase()}
        </p>
      </div>

      <div style={{ flex: 1, minHeight: 160 }}>
        <AnimalIllustration animalName={animalName} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {options.map((option) => (
          <AnswerRow key={option} text={option} state={answerRowState(option, selected)} onClick={() => onSelect(option)} />
        ))}
      </div>
    </Shell>
  )
}

function RevealScreen({
  isCorrect,
  pointsAwarded,
  animalName,
  correctNoun,
  etymology,
  onNext,
}: {
  isCorrect: boolean
  pointsAwarded: number
  animalName: string
  correctNoun: string
  etymology: string | null
  onNext: () => void
}) {
  return (
    <Shell>
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
            background: isCorrect ? 'var(--fb-tint-bg)' : 'transparent',
            border: `1.5px solid ${isCorrect ? 'var(--fb-tint-border)' : 'var(--fb-border-strong)'}`,
            color: isCorrect ? 'var(--fb-accent-text)' : 'var(--fb-text-4)',
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

      <div className="fb-tint-card">
        <p className="fb-pair-top on-tint" style={{ fontSize: 40 }}>
          {correctNoun}
        </p>
        <p className="fb-pair-bottom on-tint" style={{ fontSize: 40 }}>
          of {animalName.toLowerCase()}s
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

function RoundResultsScreen({
  players,
  questionIndex,
  totalQuestions,
  onBack,
}: {
  players: DBRoomPlayer[]
  questionIndex: number
  totalQuestions: number
  onBack: () => void
}) {
  return (
    <Shell>
      <p style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Round {questionIndex + 1} Results</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {players.map((p, i) => (
          <div key={p.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--fb-text-3)', fontVariantNumeric: 'tabular-nums' }}>
              {String(i + 1).padStart(2, '0')}
            </span>
            <Avatar initial={p.display_name.slice(0, 1)} />
            <span style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>{p.display_name}</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fb-text)', fontVariantNumeric: 'tabular-nums' }}>
              {p.score}
            </span>
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

function FinishedScreen({ players }: { players: DBRoomPlayer[] }) {
  return (
    <Shell>
      <div style={{ flex: 1 }} />
      <p style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.04em', textAlign: 'center', margin: 0 }}>
        Final Results
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
        {players.map((p, i) => (
          <div key={p.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--fb-text-3)' }}>{String(i + 1).padStart(2, '0')}</span>
            <Avatar initial={p.display_name.slice(0, 1)} />
            <span style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>{p.display_name}</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fb-text)' }}>{p.score}</span>
          </div>
        ))}
      </div>
      <div style={{ flex: 1 }} />
    </Shell>
  )
}
