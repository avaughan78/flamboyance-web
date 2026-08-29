import { useEffect, useState } from 'react'
import { Shell, Wordmark, inputStyle } from '../components/Shared'
import { PillButton } from '../components/PillButton'
import {
  AdminAuthError,
  bulkModerate,
  deleteCommunityNoun,
  editCommunityNoun,
  fetchCommunityNouns,
  fetchCounts,
  moderateCommunityNoun,
  setFlagged,
  type AdminCreds,
  type CommunityNounRow,
  type Counts,
  type Tab,
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

const TABS: Tab[] = ['pending', 'approved', 'rejected', 'flagged']

function ModerationScreen({ creds, onLogout }: { creds: AdminCreds; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('pending')
  const [rows, setRows] = useState<CommunityNounRow[] | null>(null)
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState<Counts | null>(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sortByLikes, setSortByLikes] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  // Debounced so every keystroke doesn't fire a request — 300ms is enough
  // to feel instant without hammering the function on fast typing.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const effectiveSort = tab === 'approved' && sortByLikes

  async function load() {
    setError(null)
    try {
      const page = await fetchCommunityNouns(creds, tab, { search: debouncedSearch, sortByLikes: effectiveSort })
      setRows(page.rows)
      setTotal(page.total)
    } catch (err) {
      if (err instanceof AdminAuthError) {
        onLogout()
        return
      }
      setError("Couldn't load submissions")
    }
  }

  async function loadCounts() {
    try {
      setCounts(await fetchCounts(creds))
    } catch {
      // Badge counts are a nice-to-have — a failed refresh just leaves
      // the last-known numbers on the tabs rather than surfacing an error.
    }
  }

  useEffect(() => {
    setRows(null)
    setSelected(new Set())
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, debouncedSearch, sortByLikes])

  useEffect(() => {
    loadCounts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadMore() {
    setIsLoadingMore(true)
    try {
      const page = await fetchCommunityNouns(creds, tab, {
        search: debouncedSearch,
        sortByLikes: effectiveSort,
        offset: rows?.length ?? 0,
      })
      setRows((prev) => [...(prev ?? []), ...page.rows])
      setTotal(page.total)
    } catch {
      setError("Couldn't load more — try again")
    } finally {
      setIsLoadingMore(false)
    }
  }

  async function act(id: string, action: 'approve' | 'reject') {
    setBusyId(id)
    try {
      await moderateCommunityNoun(creds, id, action)
      setRows((prev) => prev?.filter((r) => r.id !== id) ?? null)
      setTotal((t) => Math.max(0, t - 1))
      loadCounts()
    } catch {
      setError("Couldn't update that submission — try again")
    } finally {
      setBusyId(null)
    }
  }

  async function removeOne(id: string) {
    if (!window.confirm("Delete this submission permanently? This can't be undone.")) return
    setBusyId(id)
    try {
      await deleteCommunityNoun(creds, id)
      setRows((prev) => prev?.filter((r) => r.id !== id) ?? null)
      setTotal((t) => Math.max(0, t - 1))
      loadCounts()
    } catch {
      setError("Couldn't delete that submission — try again")
    } finally {
      setBusyId(null)
    }
  }

  function handleSaved(updated: CommunityNounRow) {
    // On the Flagged tab specifically, unflagging should drop the row
    // from view — that tab's whole query is `flagged = true`, so a row
    // that's no longer flagged doesn't belong in the current list.
    if (tab === 'flagged' && !updated.flagged) {
      setRows((prev) => prev?.filter((r) => r.id !== updated.id) ?? null)
      setTotal((t) => Math.max(0, t - 1))
      loadCounts()
      return
    }
    setRows((prev) => prev?.map((r) => (r.id === updated.id ? updated : r)) ?? null)
    loadCounts()
  }

  async function toggleFlag(id: string, flagged: boolean, note?: string) {
    setBusyId(id)
    try {
      handleSaved(await setFlagged(creds, id, flagged, note))
    } catch {
      setError("Couldn't update that submission — try again")
    } finally {
      setBusyId(null)
    }
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function bulkAct(operation: 'approve' | 'reject' | 'delete') {
    if (selected.size === 0) return
    if (operation === 'delete' && !window.confirm(`Delete ${selected.size} submission(s) permanently? This can't be undone.`)) {
      return
    }
    setBulkBusy(true)
    try {
      await bulkModerate(creds, [...selected], operation)
      setRows((prev) => prev?.filter((r) => !selected.has(r.id)) ?? null)
      setTotal((t) => Math.max(0, t - selected.size))
      setSelected(new Set())
      loadCounts()
    } catch {
      setError('That bulk action failed — try again')
    } finally {
      setBulkBusy(false)
    }
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
            {counts && counts[t] > 0 ? ` (${counts[t]})` : ''}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          style={{ ...inputStyle, flex: 1, padding: '10px 14px', fontSize: 14 }}
          placeholder="Search noun or thing…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          onClick={() => {
            setSelectMode((v) => !v)
            setSelected(new Set())
          }}
          style={{
            fontSize: 13,
            fontWeight: 600,
            padding: '0 14px',
            borderRadius: 11,
            border: '1px solid var(--fb-border-strong)',
            color: selectMode ? 'var(--fb-accent-text)' : 'var(--fb-text-3)',
          }}
        >
          {selectMode ? 'Done' : 'Select'}
        </button>
      </div>

      {tab === 'approved' && (
        <button
          onClick={() => setSortByLikes((v) => !v)}
          style={{ alignSelf: 'flex-start', fontSize: 12, color: 'var(--fb-text-3)' }}
        >
          Sorted by {sortByLikes ? 'most liked' : 'newest'} — tap to switch
        </button>
      )}

      {selectMode && selected.size > 0 && (
        <div className="fb-tint-card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--fb-text-2)', flex: 1 }}>{selected.size} selected</span>
          {tab === 'pending' && (
            <>
              <PillButton style="text" disabled={bulkBusy} onClick={() => bulkAct('approve')}>
                Approve
              </PillButton>
              <PillButton style="text" disabled={bulkBusy} onClick={() => bulkAct('reject')}>
                Reject
              </PillButton>
            </>
          )}
          <button
            onClick={() => bulkAct('delete')}
            disabled={bulkBusy}
            style={{ fontSize: 13, fontWeight: 600, color: 'var(--fb-accent)' }}
          >
            Delete
          </button>
        </div>
      )}

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
              onToggleFlag={toggleFlag}
              onDelete={removeOne}
              selectMode={selectMode}
              isSelected={selected.has(row.id)}
              onToggleSelected={() => toggleSelected(row.id)}
            />
          ))}
          {rows.length < total && (
            <PillButton style="ghost" disabled={isLoadingMore} onClick={loadMore}>
              {isLoadingMore ? 'Loading…' : `Load more (${total - rows.length} left)`}
            </PillButton>
          )}
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
  onToggleFlag,
  onDelete,
  selectMode,
  isSelected,
  onToggleSelected,
}: {
  row: CommunityNounRow
  creds: AdminCreds
  busy: boolean
  onAct?: (id: string, action: 'approve' | 'reject') => void
  onSaved: (row: CommunityNounRow) => void
  onToggleFlag: (id: string, flagged: boolean, note?: string) => void
  onDelete: (id: string) => void
  selectMode: boolean
  isSelected: boolean
  onToggleSelected: () => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [noun, setNoun] = useState(row.noun)
  const [thingName, setThingName] = useState(row.thing_name)
  const [description, setDescription] = useState(row.description ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isFlagging, setIsFlagging] = useState(false)
  const [flagNoteDraft, setFlagNoteDraft] = useState('')

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
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {selectMode && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelected}
            style={{ marginTop: 4, width: 18, height: 18, flexShrink: 0 }}
          />
        )}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div>
            {row.flagged && (
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--fb-accent)', margin: '0 0 2px' }}>🚩 Flagged</p>
            )}
            <p className="fb-pair-top on-tint" style={{ fontSize: 20 }}>
              A {row.noun}
            </p>
            <p className="fb-pair-bottom on-tint" style={{ fontSize: 20 }}>
              of {row.thing_name}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
            <button
              onClick={() => (row.flagged ? onToggleFlag(row.id, false) : setIsFlagging(true))}
              disabled={busy}
              style={{ fontSize: 12, color: row.flagged ? 'var(--fb-accent)' : 'var(--fb-text-3)', padding: '4px 0' }}
            >
              {row.flagged ? 'Unflag' : 'Flag'}
            </button>
            <button onClick={startEditing} style={{ fontSize: 12, color: 'var(--fb-text-3)', padding: '4px 0' }}>
              Edit
            </button>
          </div>
        </div>
      </div>
      {row.description && (
        <p style={{ fontSize: 13, color: 'var(--fb-text-2)', margin: 0 }}>{row.description}</p>
      )}
      {row.flag_note && (
        <p style={{ fontSize: 12, color: 'var(--fb-accent)', margin: 0 }}>Flag note: {row.flag_note}</p>
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

      {isFlagging && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <textarea
            style={{ ...inputStyle, resize: 'vertical', minHeight: 44, fontFamily: 'inherit', fontSize: 13 }}
            value={flagNoteDraft}
            onChange={(e) => setFlagNoteDraft(e.target.value)}
            placeholder="Why? (optional — e.g. paraphrase the report email)"
            maxLength={300}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <PillButton
              disabled={busy}
              onClick={() => {
                onToggleFlag(row.id, true, flagNoteDraft.trim() || undefined)
                setIsFlagging(false)
                setFlagNoteDraft('')
              }}
            >
              Add flag
            </PillButton>
            <PillButton style="ghost" disabled={busy} onClick={() => setIsFlagging(false)}>
              Cancel
            </PillButton>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
        {onAct && (
          <>
            <PillButton disabled={busy} onClick={() => onAct(row.id, 'approve')}>
              {busy ? '…' : 'Approve'}
            </PillButton>
            <PillButton style="ghost" disabled={busy} onClick={() => onAct(row.id, 'reject')}>
              {busy ? '…' : 'Reject'}
            </PillButton>
          </>
        )}
        <button
          onClick={() => onDelete(row.id)}
          disabled={busy}
          style={{ fontSize: 13, fontWeight: 600, color: 'var(--fb-text-4)' }}
        >
          Delete
        </button>
      </div>
    </div>
  )
}
