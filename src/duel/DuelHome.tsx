import { useState } from 'react'
import { Shell, Wordmark, inputStyle } from '../components/Shared'
import { PillButton } from '../components/PillButton'
import { resolveDuelCode } from './duelApi'

// Same charset native generates share codes from — no O/0/I/1, so a typed
// code is never ambiguous read back off a screen.
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function generateShareCode(): string {
  return Array.from({ length: 4 }, () => CHARSET[Math.floor(Math.random() * CHARSET.length)]).join('')
}

export function DuelHome({
  onStartQueue,
  onBack,
}: {
  onStartQueue: (displayName: string, preferredOpponentId: string | null, shareCode: string | null) => void
  onBack: () => void
}) {
  const [name, setName] = useState('')
  const [friendCode, setFriendCode] = useState('')
  const [mode, setMode] = useState<'menu' | 'enterCode'>('menu')
  const [isResolving, setIsResolving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function requireName(): string | null {
    if (!name.trim()) {
      setError('Enter your name first.')
      return null
    }
    setError(null)
    return name.trim()
  }

  async function startRandom() {
    const trimmed = requireName()
    if (!trimmed) return
    onStartQueue(trimmed, null, null)
  }

  async function startShareCode() {
    const trimmed = requireName()
    if (!trimmed) return
    onStartQueue(trimmed, null, generateShareCode())
  }

  async function joinFriendCode() {
    const trimmed = requireName()
    if (!trimmed) return
    if (!friendCode.trim()) {
      setError("Enter your friend's code.")
      return
    }
    setIsResolving(true)
    setError(null)
    try {
      const opponentId = await resolveDuelCode(friendCode.trim())
      if (!opponentId) {
        setError("Couldn't find that code — ask them to double-check it.")
        setIsResolving(false)
        return
      }
      onStartQueue(trimmed, opponentId, null)
    } catch {
      setError('Something went wrong — try again.')
      setIsResolving(false)
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
            Play a Duel
          </h1>
          <p style={{ fontSize: 14, color: 'var(--fb-text-3)', margin: '8px 0 0' }}>
            Head-to-head, 10 questions, rated. Winner takes the rating points.
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

        {mode === 'menu' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <PillButton onClick={startRandom}>Random Match</PillButton>
            <PillButton style="ghost" onClick={startShareCode}>
              Play a Friend — Share a Code
            </PillButton>
            <PillButton style="ghost" onClick={() => setMode('enterCode')}>
              Enter a Friend's Code
            </PillButton>
          </div>
        )}

        {mode === 'enterCode' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fb-text-3)' }}>FRIEND'S CODE</span>
              <input
                value={friendCode}
                onChange={(e) => setFriendCode(e.target.value.toUpperCase())}
                placeholder="7FQ2"
                maxLength={4}
                style={{ ...inputStyle, letterSpacing: 6, fontWeight: 600 }}
              />
            </label>
            <PillButton onClick={joinFriendCode} disabled={isResolving}>
              {isResolving ? 'Finding them…' : 'Challenge'}
            </PillButton>
            <PillButton style="text" onClick={() => setMode('menu')}>
              Back
            </PillButton>
          </div>
        )}

        {error && <p style={{ fontSize: 13, color: 'var(--fb-accent)', margin: 0 }}>{error}</p>}

        <PillButton style="text" onClick={onBack}>
          Back to Party
        </PillButton>
      </div>
    </Shell>
  )
}
