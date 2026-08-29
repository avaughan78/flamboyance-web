import { supabase } from '../supabase'
import { ensureSignedIn } from '../game'
import type { ContentPool, DBRoom } from '../types'

export interface DuelMatchResult {
  matched: boolean
  room_id?: string
  room_code?: string
  opponent_name?: string
  opponent_rating?: number
  your_rating?: number
}

export interface DuelReadyResult {
  room: DBRoom
  all_ready: boolean
  pools_match: boolean
  your_pool: ContentPool | null
  opponent_pool: ContentPool | null
}

export interface DuelFinishResult {
  user_id: string
  rating_delta: number
  new_rating: number
}

/** Turns a friend's typed share code into their user id, so it can be
 * passed as `preferred_opponent_id` to `duel-matchmake` — mirrors
 * GameService's direct RPC call, not an edge function. Returns null if the
 * code is unknown/expired (matchmaking_queue rows older than 10 minutes
 * are ignored server-side). */
export async function resolveDuelCode(code: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('resolve_duel_code', { p_code: code.trim() })
  if (error) throw error
  return (data as string | null) ?? null
}

export async function duelMatchmake(
  displayName: string,
  preferredOpponentId?: string | null,
  shareCode?: string | null
): Promise<DuelMatchResult> {
  await ensureSignedIn()
  const { data, error } = await supabase.functions.invoke('duel-matchmake', {
    body: { display_name: displayName, preferred_opponent_id: preferredOpponentId, share_code: shareCode },
  })
  if (error) throw error
  return data as DuelMatchResult
}

/** Purely cosmetic — ids of other anonymous players currently in the
 * random-match queue, for a "N players looking for a match" style
 * waiting-room indicator. No names (RLS gives no client access to
 * matchmaking_queue directly). */
export async function listAnonymousDuelQueue(userId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc('list_anonymous_duel_queue', { p_user_id: userId })
  if (error) return []
  return ((data as { entry_id: string }[] | null) ?? []).map((row) => row.entry_id)
}

/** Best-effort — swallow errors, since this is called from unmount/cancel
 * paths where there's nothing meaningful to recover from on failure. */
export async function leaveDuelQueue(): Promise<void> {
  try {
    await supabase.functions.invoke('leave-duel-queue', { body: {} })
  } catch {
    // best-effort only
  }
}

export async function markDuelReady(roomId: string, pool: ContentPool): Promise<DuelReadyResult> {
  const { data, error } = await supabase.functions.invoke('mark-duel-ready', {
    body: { room_id: roomId, pool },
  })
  if (error) throw error
  return data as DuelReadyResult
}

/** Early "Next" tap on Reveal, before the local per-player countdown
 * elapses. Advances only once BOTH players have marked the SAME
 * expected_index ready — a stale/late call (opponent already advanced)
 * just returns current state with all_ready: true, never double-advances. */
export async function markRoundReady(roomId: string, expectedIndex: number): Promise<DuelReadyResult> {
  const { data, error } = await supabase.functions.invoke('mark-round-ready', {
    body: { room_id: roomId, expected_index: expectedIndex },
  })
  if (error) throw error
  return data as DuelReadyResult
}

/** The Reveal countdown's fallback path — called unconditionally when the
 * visible 5s countdown hits zero, regardless of whether the opponent ever
 * tapped Next. expected_index makes a double-advance race safe: whichever
 * request lands first wins, the other just reads back the already-moved
 * room. */
export async function advanceDuelRound(roomId: string, expectedIndex: number): Promise<{ room: DBRoom }> {
  const { data, error } = await supabase.functions.invoke('advance-duel-round', {
    body: { room_id: roomId, expected_index: expectedIndex },
  })
  if (error) throw error
  return data as { room: DBRoom }
}

/** Idempotent — safe to call every time DuelResult mounts, including a
 * remount/refresh. Only the room's first active -> finished transition
 * actually resolves Elo; every subsequent call just reads back what
 * already happened. */
export async function finishDuel(roomId: string): Promise<DuelFinishResult[]> {
  const { data, error } = await supabase.functions.invoke('finish-duel', {
    body: { room_id: roomId },
  })
  if (error) throw error
  return (data as { results: DuelFinishResult[] }).results
}

export interface LeagueStanding {
  user_id: string
  points: number
  display_name: string
}

/** ISO week (Monday, UTC) as YYYY-MM-DD — matches the server's
 * `date_trunc('week', now())::date` exactly, which is what
 * add_league_points_for() keys `league_points.week_start` on. */
function currentIsoWeekStart(): string {
  const now = new Date()
  const day = now.getUTCDay() || 7 // Sunday (0) -> 7, so Monday is always day 1
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (day - 1)))
  return monday.toISOString().slice(0, 10)
}

/** Top-3 for the current week, shown on DuelResult right after finishDuel
 * so this match's own league points (awarded server-side inside
 * finish_duel/check_duel_afk_forfeit) are already reflected. Two queries
 * rather than a join — league_points has no FK to profiles, the name
 * lookup happens client-side, mirroring GameService.fetchLeagueStandings(). */
export async function fetchLeagueStandings(): Promise<LeagueStanding[]> {
  const { data: rows, error } = await supabase
    .from('league_points')
    .select('user_id, points')
    .eq('week_start', currentIsoWeekStart())
    .order('points', { ascending: false })
    .limit(3)
  if (error) throw error
  const typedRows = (rows as { user_id: string; points: number }[]) ?? []
  if (typedRows.length === 0) return []

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', typedRows.map((r) => r.user_id))
  if (profilesError) throw profilesError
  const names = new Map(((profiles as { id: string; display_name: string }[]) ?? []).map((p) => [p.id, p.display_name]))

  return typedRows.map((row) => ({ user_id: row.user_id, points: row.points, display_name: names.get(row.user_id) ?? 'Player' }))
}
