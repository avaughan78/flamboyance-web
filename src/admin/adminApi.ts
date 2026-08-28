export type AdminCreds = { username: string; password: string }

export type CommunityNounStatus = 'pending' | 'approved' | 'rejected'

export type AdminVerdict = { reject: boolean; reason: string } | { error: true; message: string } | null

export type CommunityNounRow = {
  id: string
  noun: string
  thing_name: string
  description: string | null
  status: CommunityNounStatus
  ai_verdict: AdminVerdict
  likes_count: number
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

export async function fetchCommunityNouns(creds: AdminCreds, status: CommunityNounStatus): Promise<CommunityNounRow[]> {
  const res = await adminFetch(creds, `?status=${status}`)
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
