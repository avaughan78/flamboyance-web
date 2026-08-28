import { useState } from 'react'
import { Shell, Wordmark } from './components/Shared'
import { PillButton } from './components/PillButton'
import { DuelApp } from './duel/DuelApp'
import { PartyApp } from './party/PartyApp'

function codeFromUrl(): string {
  return new URLSearchParams(window.location.search).get('code')?.toUpperCase() ?? ''
}

export default function App() {
  // A typed/pasted ?code= link is always someone sharing a Party — skip
  // straight past the landing choice for that case, same as today.
  const [mode, setMode] = useState<'landing' | 'party' | 'duel'>(codeFromUrl() ? 'party' : 'landing')

  if (mode === 'duel') {
    return <DuelApp onBackToParty={() => setMode('landing')} />
  }
  if (mode === 'party') {
    return <PartyApp onBackToLanding={() => setMode('landing')} />
  }
  return <LandingScreen onJoinParty={() => setMode('party')} onPlayDuel={() => setMode('duel')} />
}

function LandingScreen({ onJoinParty, onPlayDuel }: { onJoinParty: () => void; onPlayDuel: () => void }) {
  return (
    <Shell>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 22 }}>
        <div>
          <div style={{ marginBottom: 10 }}>
            <Wordmark />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.04em', margin: 0, lineHeight: 1.1 }}>
            What are we playing?
          </h1>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <PillButton onClick={onJoinParty}>Join a Party</PillButton>
          <PillButton style="ghost" onClick={onPlayDuel}>
            Play a Duel
          </PillButton>
        </div>
      </div>
    </Shell>
  )
}
