import { useEffect, useMemo, useRef, useState } from 'react'
import type { DBAnimal, DBCollectiveNoun, DBRoom, DBRoomPlayer, SubmitAnswerResponse } from './types'
import {
  animalName as lookupAnimalName,
  choices,
  ensureSignedIn,
  fetchExistingAnswer,
  joinRoom,
  loadContent,
  observePlayers,
  observeRoom,
  submitAnswer,
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
    setSelected(option)
    try {
      const response = await submitAnswer(room.id, room.current_question_index, option)
      setResult(response)
    } catch {
      setSelected(null)
    }
  }

  const animalNameForCurrentQuestion = useMemo(() => {
    if (!room || !content) return ''
    const nounId = room.question_ids[room.current_question_index]
    return nounId ? lookupAnimalName(content.animals, content.nouns, nounId) : ''
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

  return (
    <QuestionScreen
      questionIndex={room.current_question_index}
      totalQuestions={room.question_ids.length}
      animalName={animalNameForCurrentQuestion}
      options={options}
      correctText={correctText}
      selected={selected}
      result={result}
      onSelect={handleAnswer}
      onNext={() => setViewingResults(true)}
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
          <p className="fb-display" style={{ fontSize: 17, margin: '0 0 4px', color: 'var(--fb-ink)' }}>
            Flamboyance
          </p>
          <h1 className="fb-display" style={{ fontSize: 28, margin: 0, lineHeight: 1.1 }}>
            Join a party
          </h1>
          <p style={{ fontSize: 14, color: 'var(--fb-ink-soft)', margin: '8px 0 0' }}>
            Someone on iPhone started a room — pop in your name and the code they gave you.
          </p>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fb-ink-soft)' }}>YOUR NAME</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What should we call you?"
            style={inputStyle}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fb-ink-soft)' }}>ROOM CODE</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="7FQ2"
            maxLength={4}
            style={{ ...inputStyle, letterSpacing: 6, fontWeight: 700 }}
          />
        </label>

        {error && <p style={{ fontSize: 13, color: 'var(--fb-coral)', margin: 0 }}>{error}</p>}

        <PillButton onClick={submit} disabled={isJoining}>
          {isJoining ? 'Joining…' : 'Join Party'}
        </PillButton>
      </div>
    </Shell>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '14px 16px',
  borderRadius: 14,
  background: 'var(--fb-coral-soft)',
  color: 'var(--fb-ink)',
  fontSize: 16,
  outline: 'none',
}

function LobbyScreen({ room, players }: { room: DBRoom; players: DBRoomPlayer[] }) {
  return (
    <Shell>
      <div
        style={{
          textAlign: 'center',
          padding: '22px 0',
          background: 'var(--fb-teal-soft)',
          borderRadius: 18,
        }}
      >
        <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--fb-teal)', margin: '0 0 8px' }}>YOU'RE IN</p>
        <p className="fb-display" style={{ fontSize: 34, letterSpacing: 6, margin: 0 }}>
          {room.code}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {players.map((p) => (
          <div key={p.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar initial={p.display_name.slice(0, 1)} />
            <span style={{ fontSize: 15, fontWeight: 600 }}>{p.display_name}</span>
          </div>
        ))}
      </div>

      <div style={{ flex: 1 }} />
      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--fb-ink-soft)', textAlign: 'center' }}>
        Waiting for the host to start…
      </p>
    </Shell>
  )
}

function Avatar({ initial }: { initial: string }) {
  return (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        background: 'var(--fb-coral)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
        fontWeight: 700,
        color: 'rgba(0,0,0,.75)',
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
  correctText,
  selected,
  result,
  onSelect,
  onNext,
}: {
  questionIndex: number
  totalQuestions: number
  animalName: string
  options: string[]
  correctText: string
  selected: string | null
  result: SubmitAnswerResponse | null
  onSelect: (option: string) => void
  onNext: () => void
}) {
  const revealed = result !== null

  return (
    <Shell>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--fb-ink-soft)' }}>
          <span>
            Question {questionIndex + 1} of {totalQuestions}
          </span>
          <span>{revealed ? (result?.is_correct ? `+${result.points_awarded}` : 'Not quite') : ''}</span>
        </div>
        <div style={{ height: 5, borderRadius: 999, background: 'var(--fb-hairline)', marginTop: 8, overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${(questionIndex / Math.max(totalQuestions, 1)) * 100}%`,
              background: 'var(--fb-coral)',
            }}
          />
        </div>
      </div>

      <p className="fb-display" style={{ fontSize: 20, textAlign: 'center', margin: 0 }}>
        A group of {animalName.toLowerCase()}s is called a…
      </p>

      <div style={{ flex: 1, minHeight: 160 }}>
        <AnimalIllustration animalName={animalName} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {options.map((option, index) => (
          <AnswerRow
            key={option}
            text={option}
            index={index}
            state={answerRowState(option, selected, correctText, revealed)}
            onClick={() => onSelect(option)}
          />
        ))}
      </div>

      <PillButton onClick={onNext} disabled={!revealed}>
        See leaderboard
      </PillButton>
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
      <p style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Round {questionIndex + 1} Results</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {players.map((p, i) => (
          <div key={p.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--fb-ink-soft)', fontVariantNumeric: 'tabular-nums' }}>
              {String(i + 1).padStart(2, '0')}
            </span>
            <Avatar initial={p.display_name.slice(0, 1)} />
            <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{p.display_name}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--fb-teal)', fontVariantNumeric: 'tabular-nums' }}>
              {p.score}
            </span>
          </div>
        ))}
      </div>
      <div style={{ flex: 1 }} />
      <p style={{ fontSize: 12, color: 'var(--fb-ink-soft)', textAlign: 'center', margin: '0 0 14px' }}>
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
      <p className="fb-display" style={{ fontSize: 28, textAlign: 'center', margin: 0 }}>
        Final Results
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
        {players.map((p, i) => (
          <div key={p.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--fb-ink-soft)' }}>{String(i + 1).padStart(2, '0')}</span>
            <Avatar initial={p.display_name.slice(0, 1)} />
            <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{p.display_name}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--fb-teal)' }}>{p.score}</span>
          </div>
        ))}
      </div>
      <div style={{ flex: 1 }} />
    </Shell>
  )
}
