import { useState } from 'react'
import { Shell, Wordmark, inputStyle } from '../components/Shared'
import { PillButton } from '../components/PillButton'
import { joinGameSession } from './partyApi'

function codeFromUrl(): string {
  return new URLSearchParams(window.location.search).get('code')?.toUpperCase() ?? ''
}

export function JoinParty({
  onJoined,
  onBack,
}: {
  onJoined: (sessionId: string) => void
  onBack?: () => void
}) {
  const [code, setCode] = useState(codeFromUrl())
  const [name, setName] = useState('')
  const [isJoining, setIsJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!code.trim() || !name.trim()) {
      setError('Enter your name and the party code.')
      return
    }
    setError(null)
    setIsJoining(true)
    try {
      const result = await joinGameSession(code.trim(), name.trim())
      onJoined(result.session_id)
    } catch (err) {
      setError((err as { message?: string })?.message ?? "Couldn't find that party — check the code and try again.")
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
            Someone started a party — pop in your name and the code they gave you.
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
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fb-text-3)' }}>PARTY CODE</span>
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

        {onBack && (
          <PillButton style="text" onClick={onBack}>
            Back
          </PillButton>
        )}
      </div>
    </Shell>
  )
}
