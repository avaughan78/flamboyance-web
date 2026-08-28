import { useEffect, useRef, useState } from 'react'
import type { DBAnimal, DBCollectiveNoun, DBGameSession } from '../types'
import { etymology as lookupEtymology, indefiniteArticle, nounText as lookupNounText, unlockCard } from '../game'
import { choices } from '../lib/seededShuffle'
import { fetchGameSession, heartbeat, submitPartyAnswer, type SubmitPartyAnswerResponse } from './partyApi'
import { Shell, LeaveButton, CountdownRing } from '../components/Shared'
import { AnswerRow, answerRowState } from '../components/AnswerRow'
import { PillButton } from '../components/PillButton'

const ROUND_DURATION = 12
const REVEAL_COUNTDOWN_SECONDS = 5
const HEARTBEAT_MS = 5000
const SESSION_POLL_MS = 1000

export function PartyQuestion({
  session,
  content,
  onGoToStandings,
  onSessionChanged,
  onLeave,
}: {
  session: DBGameSession
  content: { animals: DBAnimal[]; nouns: DBCollectiveNoun[] }
  onGoToStandings: () => void
  onSessionChanged: (session: DBGameSession) => void
  onLeave: () => void
}) {
  const questionIndex = session.current_question_index
  const totalQuestions = session.total_questions

  const [selected, setSelected] = useState<string | null>(null)
  const [result, setResult] = useState<SubmitPartyAnswerResponse | null>(null)
  const [options, setOptions] = useState<string[]>([])
  const [nounText, setNounText] = useState('')
  const [etymologyText, setEtymologyText] = useState<string | null>(null)
  const [secondsRemaining, setSecondsRemaining] = useState(ROUND_DURATION)
  const [revealCountdown, setRevealCountdown] = useState<number | null>(null)

  const onSessionChangedRef = useRef(onSessionChanged)
  onSessionChangedRef.current = onSessionChanged
  const onGoToStandingsRef = useRef(onGoToStandings)
  onGoToStandingsRef.current = onGoToStandings
  const advancedRef = useRef(false)

  // Reset per-question state and derive this round's seeded options.
  useEffect(() => {
    const nounId = session.question_ids[questionIndex]
    if (!nounId) return
    setSelected(null)
    setResult(null)
    setRevealCountdown(null)
    advancedRef.current = false

    const seed = `${session.id.toLowerCase()}-${questionIndex}`
    const picked = choices(content.animals, content.nouns, nounId, seed)
    setOptions(picked.options)
    setNounText(lookupNounText(content.nouns, nounId))
    setEtymologyText(lookupEtymology(content.nouns, nounId))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, questionIndex])

  async function handleAnswer(option: string) {
    if (selected) return
    setSelected(option)
    try {
      const response = await submitPartyAnswer(session.id, questionIndex, option)
      setResult(response)
      const nounId = session.question_ids[questionIndex]
      if (response.is_correct && nounId) unlockCard(nounId).catch(() => {})
    } catch {
      setSelected(null)
    }
  }

  // 12s countdown from the server-authoritative question_started_at.
  useEffect(() => {
    if (selected) return
    const startedAt = new Date(session.question_started_at).getTime()
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
  }, [session.id, questionIndex, selected])

  // Reveal: unconditional 5s countdown — unlike Duel, Party never waits on
  // anyone here (that's what Standings' arrival gate is for). Ticks down
  // regardless of what other players are doing, then heads to Standings.
  useEffect(() => {
    if (!result) return
    setRevealCountdown(REVEAL_COUNTDOWN_SECONDS)
    const id = window.setInterval(() => {
      setRevealCountdown((c) => {
        if (c === null) return c
        if (c <= 1) {
          window.clearInterval(id)
          if (!advancedRef.current) {
            advancedRef.current = true
            onGoToStandingsRef.current()
          }
          return 0
        }
        return c - 1
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [result])

  function handleNextTap() {
    if (advancedRef.current) return
    advancedRef.current = true
    onGoToStandingsRef.current()
  }

  // Heartbeat + straggler recovery: if the party's already moved on
  // without us (everyone else cleared Standings and the host advanced)
  // while we're still stuck answering/revealing, react immediately.
  useEffect(() => {
    heartbeat(session.id, result ? 'reveal' : 'question', questionIndex)
    const heartbeatId = window.setInterval(() => {
      heartbeat(session.id, result ? 'reveal' : 'question', questionIndex)
    }, HEARTBEAT_MS)

    const pollId = window.setInterval(async () => {
      try {
        const fresh = await fetchGameSession(session.id)
        if (fresh.status === 'cancelled' || fresh.status === 'completed' || fresh.current_question_index !== questionIndex) {
          onSessionChangedRef.current(fresh)
        }
      } catch {
        // transient
      }
    }, SESSION_POLL_MS)

    return () => {
      window.clearInterval(heartbeatId)
      window.clearInterval(pollId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, questionIndex, !!result])

  const nounId = session.question_ids[questionIndex]
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
            <p style={{ fontSize: 12, color: 'var(--fb-text-3)', margin: '3px 0 0' }}>Score: {result.score.toLocaleString()}</p>
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
            of {result.correct_animal.toLowerCase()}
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

        <div style={{ flex: 1 }} />
        <PillButton onClick={handleNextTap}>
          {revealCountdown !== null ? `See leaderboard (${revealCountdown})` : 'See leaderboard'}
        </PillButton>
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
