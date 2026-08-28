import { supabase } from '../supabase'
import { ensureSignedIn } from '../game'
import type { DBGamePlayer, DBGameSession } from '../types'

export interface JoinGameSessionResult {
  session_id: string
  game_code: string
}

export async function joinGameSession(code: string, displayName: string): Promise<JoinGameSessionResult> {
  await ensureSignedIn()
  const { data, error } = await supabase.functions.invoke('join-game-session', {
    body: { code: code.trim(), display_name: displayName },
  })
  if (error) throw error
  return data as JoinGameSessionResult
}

export interface MarkReadyResult {
  ready: true
  all_players_ready: boolean
  ready_count: number
  total_count: number
}

export async function markReady(gameSessionId: string): Promise<MarkReadyResult> {
  const { data, error } = await supabase.functions.invoke('mark-ready', {
    body: { game_session_id: gameSessionId },
  })
  if (error) throw error
  return data as MarkReadyResult
}

/** Every player sends this — host and non-host alike — every 5s, on both
 * the Lobby and Question screens. On the Standings screen, check-standings
 * itself folds in the same self-healing write (current_screen, timestamp,
 * clears disconnected_at), so no separate heartbeat call happens there. */
export async function heartbeat(
  gameSessionId: string,
  currentScreen: string,
  currentQuestionIndex: number
): Promise<void> {
  try {
    await supabase.functions.invoke('heartbeat', {
      body: { game_session_id: gameSessionId, current_screen: currentScreen, current_question_index: currentQuestionIndex },
    })
  } catch {
    // fire-and-forget — a missed beat just gets caught by the next tick
  }
}

export interface CheckStandingsResult {
  all_arrived: boolean
  can_continue: boolean
  on_standings_count: number
  total_count: number
  timeout_at: string
  kicked_players: string[]
}

/** Called by every player, host included — simultaneously "record my
 * arrival on Standings" and "check whether the gate is satisfied." A
 * non-host only ever reads all_arrived/can_continue for display; the
 * actual advance is host-only UI elsewhere (advance-question), which this
 * client never calls. */
export async function checkStandingsArrival(gameSessionId: string): Promise<CheckStandingsResult> {
  const { data, error } = await supabase.functions.invoke('check-standings', {
    body: { game_session_id: gameSessionId },
  })
  if (error) throw error
  return data as CheckStandingsResult
}

export interface SubmitPartyAnswerResponse {
  is_correct: boolean
  correct_animal: string
  score: number
}

export async function submitPartyAnswer(
  gameSessionId: string,
  questionIndex: number,
  submittedAnimal: string
): Promise<SubmitPartyAnswerResponse> {
  const { data, error } = await supabase.functions.invoke('submit-party-answer', {
    body: { game_session_id: gameSessionId, question_index: questionIndex, submitted_animal: submittedAnimal },
  })
  if (error) throw error
  return data as SubmitPartyAnswerResponse
}

/** game_players has a DELETE policy scoped to auth.uid() specifically so a
 * departing player can remove their own row directly — without this, a
 * left player's row lingers forever: still shown to everyone else as
 * present, and (per the max_players trigger) permanently occupying a
 * seat. */
export async function leaveGameSession(gameSessionId: string): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession()
  const userId = sessionData.session?.user.id
  if (!userId) return
  await supabase.from('game_players').delete().eq('game_session_id', gameSessionId).eq('user_id', userId)
}

export async function fetchGameSession(gameSessionId: string): Promise<DBGameSession> {
  const { data, error } = await supabase.from('game_sessions').select().eq('id', gameSessionId).single()
  if (error || !data) throw error ?? new Error('Party not found')
  return data as DBGameSession
}

/** Ordered by created_at — without this, a plain SELECT has no guaranteed
 * row order, and every player's own 5s heartbeat UPDATE can visibly
 * perturb physical row order between polls (a real bug hit and fixed on
 * iOS/Android this session: the ready-list would shuffle every ~1s). */
export async function fetchGamePlayers(gameSessionId: string): Promise<DBGamePlayer[]> {
  const { data, error } = await supabase
    .from('game_players')
    .select()
    .eq('game_session_id', gameSessionId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data as DBGamePlayer[]
}
