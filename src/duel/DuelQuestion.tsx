import { useEffect, useRef, useState } from 'react'
import type { DBAnimal, DBCollectiveNoun, DBRoom, DBRoomPlayer, SubmitAnswerResponse } from '../types'
import {
  etymology as lookupEtymology,
  fetchExistingAnswer,
  fetchRoom,
  fetchRoundAnswerDetails,
  indefiniteArticle,
  nounText as lookupNounText,
  submitAnswer,
  unlockCard,
} from '../game'
import { choices } from '../lib/seededShuffle'
import { advanceDuelRound, markRoundReady } from './duelApi'
import { Shell, LeaveButton, CountdownRing } from '../components/Shared'
import { AnswerRow, answerRowState } from '../components/AnswerRow'
import { PillButton } from '../components/PillButton'

const ROUND_DURATION = 12
const NEXT_COUNTDOWN_SECONDS = 5
const OPPONENT_WAIT_POLL_MS = 1000

interface VersusInfo {
  yourAnswer: string
  yourTime: string
  yourCorrect: boolean
  otherName: string
  otherAnswer: string
  otherTime: string
  otherCorrect: boolean
}

function formatElapsed(seconds: number): string {
  return `${seconds.toFixed(1)}s`
}

export function DuelQuestion({
  room,
  players,
  userId,
  content,
  onRoundAdvanced,
  onGameOver,
  onRoomUpdate,
  onLeave,
}: {
  room: DBRoom
  players: DBRoomPlayer[]
  userId: string
  content: { animals: DBAnimal[]; nouns: DBCollectiveNoun[] }
  onRoundAdvanced: (room: DBRoom, isFinalRoundNext: boolean) => void
  onGameOver: () => void
  onRoomUpdate: (room: DBRoom) => void
  onLeave: () => void
}) {
  const questionIndex = room.current_question_index
  const totalQuestions = room.question_ids.length
  const isLastQuestion = questionIndex === totalQuestions - 1
  const opponent = players.find((p) => p.user_id !== userId)

  const [selected, setSelected] = useState<string | null>(null)
  const [result, setResult] = useState<SubmitAnswerResponse | null>(null)
  const [options, setOptions] = useState<string[]>([])
  const [correctAnimal, setCorrectAnimal] = useState('')
  const [nounText, setNounText] = useState('')
  const [etymologyText, setEtymologyText] = useState<string | null>(null)
  const [secondsRemaining, setSecondsRemaining] = useState(ROUND_DURATION)
  const [opponentAnswered, setOpponentAnswered] = useState(false)
  const [versus, setVersus] = useState<VersusInfo | null>(null)
  const [nextCountdown, setNextCountdown] = useState<number | null>(null)
  const [myReadyTapped, setMyReadyTapped] = useState(false)

  const advancingRef = useRef(false)
  const roomRef = useRef(room)
  roomRef.current = room
  const onRoundAdvancedRef = useRef(onRoundAdvanced)
  onRoundAdvancedRef.current = onRoundAdvanced
  const onGameOverRef = useRef(onGameOver)
  onGameOverRef.current = onGameOver
  const onRoomUpdateRef = useRef(onRoomUpdate)
  onRoomUpdateRef.current = onRoomUpdate

  // Reset per-question state and derive this round's options from the
  // seeded shuffle — same seed format as native, so both players land on
  // the identical 4-option set for a given room id + question index.
  useEffect(() => {
    const nounId = room.question_ids[questionIndex]
    if (!nounId) return
    setSelected(null)
    setResult(null)
    setOpponentAnswered(false)
    setVersus(null)
    setNextCountdown(null)
    setMyReadyTapped(false)
    advancingRef.current = false

    const seed = `${room.id.toLowerCase()}-${questionIndex}`
    const picked = choices(content.animals, content.nouns, nounId, seed)
    setCorrectAnimal(picked.correct)
    setOptions(picked.options)
    setNounText(lookupNounText(content.nouns, nounId))
    setEtymologyText(lookupEtymology(content.nouns, nounId))

    fetchExistingAnswer(room.id, questionIndex, userId).then((existing) => {
      if (existing) {
        setSelected(existing.submitted_noun)
        setResult({ is_correct: existing.is_correct, points_awarded: 0 })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id, questionIndex])

  async function handleAnswer(option: string) {
    if (selected) return
    setSelected(option)
    try {
      const response = await submitAnswer(room.id, questionIndex, option)
      if (roomRef.current.current_question_index !== questionIndex) return
      setResult(response)
      const nounId = room.question_ids[questionIndex]
      if (response.is_correct && nounId) unlockCard(nounId).catch(() => {})
    } catch {
      if (roomRef.current.current_question_index === questionIndex) setSelected(null)
    }
  }

  // 12s countdown from the server-authoritative question_started_at —
  // never a local timer start, so both players converge on the same
  // instant regardless of when each one's view happened to mount.
  useEffect(() => {
    if (selected) return
    const startedAt = new Date(room.question_started_at).getTime()
    const tick = () => {
      const elapsed = (Date.now() - startedAt) / 1000
      const remaining = Math.max(0, ROUND_DURATION - Math.floor(elapsed))
      setSecondsRemaining(remaining)
      if (remaining === 0) handleAnswer('No answer')
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id, questionIndex, selected])

  // Reveal phase 1 (invisible): poll until the opponent has also answered
  // this round — the visible countdown never starts before that. Doubles
  // as straggler recovery: if the room's already moved on without us
  // (opponent's mutual-ready won the race), react immediately rather than
  // waiting out a countdown that no longer matters.
  useEffect(() => {
    if (!result || opponentAnswered) return
    let cancelled = false
    const startedAt = new Date(room.question_started_at).getTime()
    const tick = async () => {
      try {
        const [details, freshRoom] = await Promise.all([
          fetchRoundAnswerDetails(room.id, questionIndex),
          fetchRoom(room.id),
        ])
        if (cancelled) return
        if (freshRoom.current_question_index !== questionIndex || freshRoom.status !== 'active') {
          onRoomUpdateRef.current(freshRoom)
          return
        }
        const mine = details.find((d) => d.user_id === userId)
        const theirs = opponent ? details.find((d) => d.user_id === opponent.user_id) : undefined
        if (mine && theirs && opponent) {
          setVersus({
            yourAnswer: mine.submitted_noun,
            yourTime: formatElapsed((new Date(mine.answered_at).getTime() - startedAt) / 1000),
            yourCorrect: mine.is_correct,
            otherName: opponent.display_name,
            otherAnswer: theirs.submitted_noun,
            otherTime: formatElapsed((new Date(theirs.answered_at).getTime() - startedAt) / 1000),
            otherCorrect: theirs.is_correct,
          })
          setOpponentAnswered(true)
        }
      } catch {
        // transient — next tick retries
      }
    }
    tick()
    const id = window.setInterval(tick, OPPONENT_WAIT_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, opponentAnswered, room.id, questionIndex, userId])

  async function performAdvance() {
    if (advancingRef.current) return
    advancingRef.current = true
    if (isLastQuestion) {
      onGameOverRef.current()
      return
    }
    try {
      const { room: advanced } = await advanceDuelRound(room.id, questionIndex)
      const isFinalRoundNext = advanced.current_question_index === advanced.question_ids.length - 1
      onRoundAdvancedRef.current(advanced, isFinalRoundNext)
    } catch {
      // Fall back to a plain re-fetch — if the opponent's own advance
      // already went through, this just picks up the new index.
      try {
        const freshRoom = await fetchRoom(room.id)
        if (freshRoom.current_question_index !== questionIndex) {
          const isFinalRoundNext = freshRoom.current_question_index === freshRoom.question_ids.length - 1
          onRoundAdvancedRef.current(freshRoom, isFinalRoundNext)
        } else {
          advancingRef.current = false
        }
      } catch {
        advancingRef.current = false
      }
    }
  }

  // Reveal phase 2 (visible): starts only once the opponent has answered.
  // Always fires performAdvance at 0 regardless of whether either player
  // tapped Next early — that tap is purely an accelerant via
  // markRoundReady, never a dependency.
  useEffect(() => {
    if (!opponentAnswered) return
    setNextCountdown(NEXT_COUNTDOWN_SECONDS)
    const id = window.setInterval(() => {
      setNextCountdown((c) => {
        if (c === null) return c
        if (c <= 1) {
          window.clearInterval(id)
          performAdvance()
          return 0
        }
        return c - 1
      })
    }, 1000)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opponentAnswered])

  async function handleNextTap() {
    if (myReadyTapped) return
    setMyReadyTapped(true)
    if (isLastQuestion) {
      // Mirrors native exactly: the last question never round-trips
      // through mark-round-ready/advance-duel-round (there's no next
      // index to advance to) — Next just waits for the opponent-answered
      // gate like every other question, then heads to Results.
      return
    }
    try {
      const { room: updated, all_ready } = await markRoundReady(room.id, questionIndex)
      if (all_ready && updated.current_question_index !== questionIndex && !advancingRef.current) {
        advancingRef.current = true
        const isFinalRoundNext = updated.current_question_index === updated.question_ids.length - 1
        onRoundAdvancedRef.current(updated, isFinalRoundNext)
      }
    } catch {
      // The 5s countdown (once it starts) is the guaranteed fallback.
    }
  }

  const nounId = room.question_ids[questionIndex]
  if (!nounId) return null

  if (result) {
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
              background: result.is_correct ? 'var(--fb-tint-success-bg)' : 'transparent',
              border: `1.5px solid ${result.is_correct ? 'var(--fb-tint-success-border)' : 'var(--fb-border-strong)'}`,
              color: result.is_correct ? 'var(--fb-success-text)' : 'var(--fb-text-4)',
              fontSize: 16,
            }}
          >
            {result.is_correct ? '✓' : '✕'}
          </div>
          <div>
            <p style={{ fontSize: 17, fontWeight: 500, margin: 0 }}>{result.is_correct ? 'Correct' : 'Not this time'}</p>
            {result.is_correct && result.points_awarded > 0 && (
              <p style={{ fontSize: 12, color: 'var(--fb-text-3)', margin: '3px 0 0' }}>+{result.points_awarded}</p>
            )}
          </div>
        </div>

        <div className={result.is_correct ? 'fb-tint-card success' : 'fb-tint-card'}>
          <p className="fb-kicker" style={{ marginBottom: 10, color: result.is_correct ? 'var(--fb-success-text)' : undefined }}>
            THE WORD
          </p>
          <p className="fb-pair-top on-tint" style={{ fontSize: 40 }}>
            <span style={{ color: result.is_correct ? 'var(--fb-success-faint)' : 'var(--fb-accent-faint)' }}>
              {indefiniteArticle(nounText)}{' '}
            </span>
            {nounText.toLowerCase()}
          </p>
          <p className="fb-pair-bottom on-tint" style={{ fontSize: 40 }}>
            of {correctAnimal.toLowerCase()}
          </p>
        </div>

        {etymologyText && (
          <div>
            <div className="fb-fading-rule" style={{ marginBottom: 12 }} />
            <p className="fb-kicker" style={{ marginBottom: 8 }}>
              WHERE IT COMES FROM
            </p>
            <p style={{ fontSize: 15, lineHeight: 1.65, color: 'var(--fb-text-2)', margin: 0 }}>{etymologyText}</p>
          </div>
        )}

        {versus && (
          <div style={{ display: 'flex', gap: 10 }}>
            <VersusColumn name="You" answer={versus.yourAnswer} time={versus.yourTime} isCorrect={versus.yourCorrect} />
            <VersusColumn name={versus.otherName} answer={versus.otherAnswer} time={versus.otherTime} isCorrect={versus.otherCorrect} />
          </div>
        )}

        <div style={{ flex: 1 }} />
        {!versus && (
          <p style={{ fontSize: 12, color: 'var(--fb-text-3)', textAlign: 'center', margin: '0 0 4px' }}>
            Waiting for {opponent?.display_name ?? 'opponent'}…
          </p>
        )}
        {myReadyTapped ? (
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--fb-text-3)', textAlign: 'center', margin: 0 }}>
            Waiting for {opponent?.display_name ?? 'them'}…
          </p>
        ) : (
          <PillButton onClick={handleNextTap}>
            {opponentAnswered && nextCountdown !== null
              ? isLastQuestion
                ? `Finish (${nextCountdown})`
                : `Next (${nextCountdown})`
              : isLastQuestion
                ? 'Finish'
                : 'Next'}
          </PillButton>
        )}
      </Shell>
    )
  }

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
          <span style={{ color: 'var(--fb-text-faint)' }}>{indefiniteArticle(nounText)} </span>
          {nounText.toLowerCase()}
        </p>
        <p className="fb-pair-bottom" style={{ fontSize: 32 }}>
          of ______
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {options.map((option) => (
          <AnswerRow key={option} text={option} state={answerRowState(option, selected)} onClick={() => handleAnswer(option)} />
        ))}
      </div>

      <div style={{ flex: 1 }} />
    </Shell>
  )
}

function VersusColumn({ name, answer, time, isCorrect }: { name: string; answer: string; time: string; isCorrect: boolean }) {
  return (
    <div
      style={{
        flex: 1,
        padding: 14,
        borderRadius: 14,
        background: isCorrect ? 'var(--fb-tint-success-bg)' : 'var(--fb-tint-bg)',
        border: `1px solid ${isCorrect ? 'var(--fb-tint-success-border)' : 'var(--fb-tint-border)'}`,
      }}
    >
      <p
        style={{
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.01em',
          margin: 0,
          color: isCorrect ? 'var(--fb-success-text)' : 'var(--fb-accent-text)',
        }}
      >
        {name}
      </p>
      <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--fb-text)', margin: '6px 0 0' }}>{answer}</p>
      <p style={{ fontSize: 12, color: 'var(--fb-text-4)', margin: '6px 0 0' }}>{time}</p>
    </div>
  )
}
