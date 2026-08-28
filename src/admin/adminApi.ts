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
  created_at: string
}

const FUNCTION_URL = 'https://uockbafewpevbpxfelde.supabase.co/functions/v1/admin-community-nouns'

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

export { AdminAuthError }

export async function fetchCommunityNouns(creds: AdminCreds, tab: Tab): Promise<CommunityNounRow[]> {
  const res = await adminFetch(creds, `?status=${tab}`)
  if (!res.ok) throw new Error('Could not load submissions')
  const body = await res.json()
  return body.rows
}

export async function moderateCommunityNoun(creds: AdminCreds, id: string, action: 'approve' | 'reject'): Promise<void> {
  const res = await adminFetch(creds, '', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, action }),
  })
  if (!res.ok) throw new Error('Could not update that submission')
}

export async function setFlagged(creds: AdminCreds, id: string, flagged: boolean): Promise<CommunityNounRow> {
  const res = await adminFetch(creds, '', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, action: flagged ? 'flag' : 'unflag' }),
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
