import { useEffect, useState } from 'react'
import { Shell, Wordmark, inputStyle } from '../components/Shared'
import { PillButton } from '../components/PillButton'
import {
  AdminAuthError,
  editCommunityNoun,
  fetchCommunityNouns,
  moderateCommunityNoun,
  type AdminCreds,
  type CommunityNounRow,
  type CommunityNounStatus,
} from './adminApi'

const SESSION_KEY = 'fb-admin-creds'

export function AdminApp() {
  const [creds, setCreds] = useState<AdminCreds | null>(() => {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as AdminCreds) : null
  })

  if (!creds) {
    return (
      <LoginScreen
        onSignedIn={(c) => {
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(c))
          setCreds(c)
        }}
      />
    )
  }

  return (
    <ModerationScreen
      creds={creds}
      onLogout={() => {
        sessionStorage.removeItem(SESSION_KEY)
        setCreds(null)
      }}
    />
  )
}

function LoginScreen({ onSignedIn }: { onSignedIn: (creds: AdminCreds) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isChecking, setIsChecking] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsChecking(true)
    const creds = { username: username.trim(), password }
    try {
      // No dedicated login endpoint — the list call itself is the auth
      // check, since every request re-validates the credentials anyway.
      await fetchCommunityNouns(creds, 'pending')
      onSignedIn(creds)
    } catch (err) {
      setError(err instanceof AdminAuthError ? 'Wrong username or password' : "Couldn't reach the server — try again")
    } finally {
      setIsChecking(false)
    }
  }

  return (
    <Shell>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 22 }}>
        <Wordmark />
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.03em', margin: '0 0 4px' }}>
            Moderate submissions
          </h1>
          <input
            style={inputStyle}
            placeholder="Username"
            autoCapitalize="none"
            autoCorrect="off"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            style={inputStyle}
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <p style={{ color: 'var(--fb-accent)', fontSize: 13, margin: 0 }}>{error}</p>
          )}
          <PillButton disabled={isChecking || !username || !password}>
            {isChecking ? 'Checking…' : 'Log in'}
          </PillButton>
        </form>
      </div>
    </Shell>
  )
}

const TABS: CommunityNounStatus[] = ['pending', 'approved', 'rejected']

function ModerationScreen({ creds, onLogout }: { creds: AdminCreds; onLogout: () => void }) {
  const [tab, setTab] = useState<CommunityNounStatus>('pending')
  const [rows, setRows] = useState<CommunityNounRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    setError(null)
    try {
      setRows(await fetchCommunityNouns(creds, tab))
    } catch (err) {
      if (err instanceof AdminAuthError) {
        onLogout()
        return
      }
      setError("Couldn't load submissions")
    }
  }

  useEffect(() => {
    setRows(null)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  async function act(id: string, action: 'approve' | 'reject') {
    setBusyId(id)
    try {
      await moderateCommunityNoun(creds, id, action)
      setRows((prev) => prev?.filter((r) => r.id !== id) ?? null)
    } catch {
      setError("Couldn't update that submission — try again")
    } finally {
      setBusyId(null)
    }
  }

  function handleSaved(updated: CommunityNounRow) {
    setRows((prev) => prev?.map((r) => (r.id === updated.id ? updated : r)) ?? null)
  }

  return (
    <Shell>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Wordmark />
        <button onClick={onLogout} style={{ fontSize: 13, color: 'var(--fb-text-3)' }}>
          Log out
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6, background: 'var(--fb-surface)', border: '1px solid var(--fb-border)', borderRadius: 11, padding: 4 }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              padding: '9px 0',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              textTransform: 'capitalize',
              background: tab === t ? 'var(--fb-tint-button-bg)' : 'transparent',
              color: tab === t ? 'var(--fb-accent-text)' : 'var(--fb-text-3)',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {error && <p style={{ color: 'var(--fb-accent)', fontSize: 13, margin: 0 }}>{error}</p>}

      {rows === null ? (
        <p style={{ color: 'var(--fb-text-3)', fontSize: 14 }}>Loading…</p>
      ) : rows.length === 0 ? (
        <p style={{ color: 'var(--fb-text-3)', fontSize: 14 }}>Nothing here.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((row) => (
            <SubmissionCard
              key={row.id}
              row={row}
              creds={creds}
              busy={busyId === row.id}
              onAct={tab === 'pending' ? act : undefined}
              onSaved={handleSaved}
            />
          ))}
        </div>
      )}
    </Shell>
  )
}

function SubmissionCard({
  row,
  creds,
  busy,
  onAct,
  onSaved,
}: {
  row: CommunityNounRow
  creds: AdminCreds
  busy: boolean
  onAct?: (id: string, action: 'approve' | 'reject') => void
  onSaved: (row: CommunityNounRow) => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [noun, setNoun] = useState(row.noun)
  const [thingName, setThingName] = useState(row.thing_name)
  const [description, setDescription] = useState(row.description ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  function startEditing() {
    setNoun(row.noun)
    setThingName(row.thing_name)
    setDescription(row.description ?? '')
    setSaveError(null)
    setIsEditing(true)
  }

  async function save() {
    setIsSaving(true)
    setSaveError(null)
    try {
      const updated = await editCommunityNoun(creds, row.id, { noun, thing_name: thingName, description })
      onSaved(updated)
      setIsEditing(false)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't save those changes")
    } finally {
      setIsSaving(false)
    }
  }

  const verdict = row.ai_verdict

  if (isEditing) {
    return (
      <div className="fb-tint-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input style={inputStyle} value={noun} onChange={(e) => setNoun(e.target.value)} placeholder="Noun" maxLength={40} />
        <input
          style={inputStyle}
          value={thingName}
          onChange={(e) => setThingName(e.target.value)}
          placeholder="Thing"
          maxLength={60}
        />
        <textarea
          style={{ ...inputStyle, resize: 'vertical', minHeight: 60, fontFamily: 'inherit' }}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          maxLength={500}
        />
        {saveError && <p style={{ color: 'var(--fb-accent)', fontSize: 13, margin: 0 }}>{saveError}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <PillButton disabled={isSaving || !noun.trim() || !thingName.trim()} onClick={save}>
            {isSaving ? 'Saving…' : 'Save'}
          </PillButton>
          <PillButton style="ghost" disabled={isSaving} onClick={() => setIsEditing(false)}>
            Cancel
          </PillButton>
        </div>
      </div>
    )
  }

  return (
    <div className="fb-tint-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <p className="fb-pair-top on-tint" style={{ fontSize: 20 }}>
            A {row.noun}
          </p>
          <p className="fb-pair-bottom on-tint" style={{ fontSize: 20 }}>
            of {row.thing_name}
          </p>
        </div>
        <button onClick={startEditing} style={{ fontSize: 12, color: 'var(--fb-text-3)', flexShrink: 0, padding: '4px 0' }}>
          Edit
        </button>
      </div>
      {row.description && (
        <p style={{ fontSize: 13, color: 'var(--fb-text-2)', margin: 0 }}>{row.description}</p>
      )}
      {verdict && (
        <p style={{ fontSize: 12, color: 'var(--fb-text-3)', margin: 0 }}>
          {'error' in verdict
            ? `AI check failed: ${verdict.message}`
            : verdict.reject
              ? `AI flagged: ${verdict.reason}`
              : `AI passed: ${verdict.reason}`}
        </p>
      )}
      <p style={{ fontSize: 11, color: 'var(--fb-text-4)', margin: 0 }}>
        {new Date(row.created_at).toLocaleString()} · {row.likes_count} like{row.likes_count === 1 ? '' : 's'}
      </p>
      {onAct && (
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <PillButton disabled={busy} onClick={() => onAct(row.id, 'approve')}>
            {busy ? '…' : 'Approve'}
          </PillButton>
          <PillButton style="ghost" disabled={busy} onClick={() => onAct(row.id, 'reject')}>
            {busy ? '…' : 'Reject'}
          </PillButton>
        </div>
      )}
    </div>
  )
}
