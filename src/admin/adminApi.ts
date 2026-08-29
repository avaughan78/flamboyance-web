export type AdminCreds = { username: string; password: string }

export type CommunityNounStatus = 'pending' | 'approved' | 'rejected'

// Not a real status — a virtual tab pulling every flagged row regardless
// of status, so it's kept as a separate union from CommunityNounStatus
// rather than folded into it.
export type Tab = CommunityNounStatus | 'flagged'

export type AdminVerdict = { reject: boolean; reason: string } | { error: true; message: string } | null

export type CommunityNounRow = {
  id: string
  noun: string
  thing_name: string
  description: string | null
  status: CommunityNounStatus
  ai_verdict: AdminVerdict
  likes_count: number
  flagged: boolean
  flag_note: string | null
  created_at: string
}

export type Counts = { pending: number; approved: number; rejected: number; flagged: number }

export type Page = { rows: CommunityNounRow[]; total: number }

const FUNCTION_URL = 'https://uockbafewpevbpxfelde.supabase.co/functions/v1/admin-community-nouns'
const PAGE_SIZE = 25

class AdminAuthError extends Error {}

async function adminFetch(creds: AdminCreds, path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${FUNCTION_URL}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      'x-admin-username': creds.username,
      'x-admin-password': creds.password,
    },
  })
  if (res.status === 401) throw new AdminAuthError('Invalid username or password')
  return res
}

export { AdminAuthError, PAGE_SIZE }

export async function fetchCommunityNouns(
  creds: AdminCreds,
  tab: Tab,
  opts: { search?: string; sortByLikes?: boolean; offset?: number } = {}
): Promise<Page> {
  const params = new URLSearchParams({ status: tab, limit: String(PAGE_SIZE), offset: String(opts.offset ?? 0) })
  if (opts.search) params.set('search', opts.search)
  if (opts.sortByLikes) params.set('sort', 'likes')
  const res = await adminFetch(creds, `?${params.toString()}`)
  if (!res.ok) throw new Error('Could not load submissions')
  const body = await res.json()
  return { rows: body.rows, total: body.total }
}

export async function fetchCounts(creds: AdminCreds): Promise<Counts> {
  const res = await adminFetch(creds, '?counts=1')
  if (!res.ok) throw new Error('Could not load counts')
  return res.json()
}

export async function moderateCommunityNoun(creds: AdminCreds, id: string, action: 'approve' | 'reject'): Promise<void> {
  const res = await adminFetch(creds, '', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, action }),
  })
  if (!res.ok) throw new Error('Could not update that submission')
}

export async function bulkModerate(creds: AdminCreds, ids: string[], operation: 'approve' | 'reject' | 'delete'): Promise<void> {
  const res = await adminFetch(creds, '', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'bulk', ids, operation }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? 'Could not update those submissions')
}

export async function deleteCommunityNoun(creds: AdminCreds, id: string): Promise<void> {
  const res = await adminFetch(creds, '', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, action: 'delete' }),
  })
  if (!res.ok) throw new Error('Could not delete that submission')
}

export async function setFlagged(creds: AdminCreds, id: string, flagged: boolean, note?: string): Promise<CommunityNounRow> {
  const res = await adminFetch(creds, '', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, action: flagged ? 'flag' : 'unflag', note }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'Could not update that submission')
  return body.row
}

export async function editCommunityNoun(
  creds: AdminCreds,
  id: string,
  fields: { noun: string; thing_name: string; description: string }
): Promise<CommunityNounRow> {
  const res = await adminFetch(creds, '', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, action: 'edit', ...fields }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'Could not save those changes')
  return body.row
}
