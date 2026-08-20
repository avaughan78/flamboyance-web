import { supabase } from './supabase'
import type { DBAnimal, DBCollectiveNoun, DBRoom, DBRoomPlayer, SubmitAnswerResponse } from './types'

let contentPromise: Promise<{ animals: DBAnimal[]; nouns: DBCollectiveNoun[] }> | null = null

/** Loads the full animal/noun reference tables once and caches them for the session. */
export function loadContent() {
  if (!contentPromise) {
    contentPromise = (async () => {
      const [{ data: animals, error: animalsError }, { data: nouns, error: nounsError }] = await Promise.all([
        supabase.from('animals').select(),
        supabase.from('collective_nouns').select(),
      ])
      if (animalsError) throw animalsError
      if (nounsError) throw nounsError
      return { animals: animals as DBAnimal[], nouns: nouns as DBCollectiveNoun[] }
    })()
  }
  return contentPromise
}

export function animalName(animals: DBAnimal[], nouns: DBCollectiveNoun[], nounId: string): string {
  const noun = nouns.find((n) => n.id === nounId)
  if (!noun) return ''
  return animals.find((a) => a.id === noun.animal_id)?.name ?? ''
}

export function pluralAnimalName(animals: DBAnimal[], nouns: DBCollectiveNoun[], nounId: string): string {
  const noun = nouns.find((n) => n.id === nounId)
  if (!noun) return ''
  return animals.find((a) => a.id === noun.animal_id)?.plural_name ?? ''
}

export function nounText(nouns: DBCollectiveNoun[], nounId: string): string {
  return nouns.find((n) => n.id === nounId)?.noun ?? ''
}

/** "Tower" -> "a", "Ambush" -> "an" — mirrors indefiniteArticle(for:) in
 * the native app's Theme.swift, so both clients render the same
 * "a tower of giraffes" / "an ambush of tigers" phrasing. */
export function indefiniteArticle(noun: string): string {
  const first = noun.toLowerCase()[0]
  return first && 'aeiou'.includes(first) ? 'an' : 'a'
}

export function etymology(nouns: DBCollectiveNoun[], nounId: string): string | null {
  return nouns.find((n) => n.id === nounId)?.etymology ?? null
}

/** Mirrors GameService.unlockCard(nounId:) — safe to call on every correct
 * answer since (user_id, collective_noun_id) is the table's primary key. */
export async function unlockCard(nounId: string): Promise<void> {
  const userId = await ensureSignedIn()
  await supabase.from('user_cards').insert({ user_id: userId, collective_noun_id: nounId })
}

/**
 * The noun is given ("a crash of ______"); the player guesses the animal.
 * Returns the correct animal's plural name plus a shuffled set of 4 options
 * (3 distractor animals). Distractors exclude any animal that also
 * legitimately takes this exact noun (many animals share a noun — e.g.
 * dozens take "Herd" — so a "wrong" option must actually be wrong, not just
 * a different animal that happens to be equally correct). Mirrors
 * GameService.choices(for:) in the iOS app exactly, so web and native
 * players see equally-fair rounds.
 */
export function choices(
  animals: DBAnimal[],
  nouns: DBCollectiveNoun[],
  nounId: string
): { correct: string; options: string[] } {
  const noun = nouns.find((n) => n.id === nounId)
  if (!noun) return { correct: '', options: [] }
  const correctAnimal = animals.find((a) => a.id === noun.animal_id)
  if (!correctAnimal) return { correct: '', options: [] }

  const animalIdsSharingThisNoun = new Set(
    nouns.filter((n) => n.noun.toLowerCase() === noun.noun.toLowerCase()).map((n) => n.animal_id)
  )

  const seenNames = new Set([correctAnimal.plural_name.toLowerCase()])
  const distractors: string[] = []
  const candidates = animals.filter((a) => !animalIdsSharingThisNoun.has(a.id))
  shuffleInPlace(candidates)
  for (const candidate of candidates) {
    const key = candidate.plural_name.toLowerCase()
    if (seenNames.has(key)) continue
    seenNames.add(key)
    distractors.push(candidate.plural_name)
    if (distractors.length === 3) break
  }

  const options = [...distractors, correctAnimal.plural_name]
  shuffleInPlace(options)
  return { correct: correctAnimal.plural_name, options }
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
}

export async function ensureSignedIn(): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession()
  if (sessionData.session) return sessionData.session.user.id
  const { data, error } = await supabase.auth.signInAnonymously()
  if (error || !data.session) throw error ?? new Error('Could not sign in')
  return data.session.user.id
}

export async function joinRoom(code: string, displayName: string): Promise<DBRoom> {
  const userId = await ensureSignedIn()
  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select()
    .eq('code', code.toUpperCase())
    .single()
  if (roomError || !room) throw roomError ?? new Error('Room not found')

  // room_players is keyed on (room_id, user_id), and rejoining a room
  // you're already a row in (a page refresh, or you never actually left)
  // used to hit that primary key. score is deliberately never
  // client-writable — an UPDATE/upsert path was tried and reverted (see
  // migration 20260820121500) since PostgREST's upsert sets every payload
  // column including room_id, which would need a much broader UPDATE grant
  // than intended. Deleting any stale row first keeps this to INSERT +
  // DELETE, both already scoped tightly by RLS to your own rows.
  await supabase.from('room_players').delete().eq('room_id', room.id).eq('user_id', userId)
  const { error: joinError } = await supabase
    .from('room_players')
    .insert({ room_id: room.id, user_id: userId, display_name: displayName })
  if (joinError) throw joinError

  return room as DBRoom
}

/** Mirrors GameService.cancelRoom(roomId:) — the host-initiated end for a
 * party, so anyone still on that code gets a real "Party ended" signal
 * instead of sitting on a stale screen forever. */
export async function cancelRoom(roomId: string): Promise<void> {
  await supabase.from('rooms').update({ status: 'cancelled' }).eq('id', roomId)
}

/** Actually removes you from the room, unlike just navigating away locally —
 * without this, a departing player's row sat in room_players forever: still
 * shown to everyone else as present, and blocking that same player from
 * ever rejoining (INSERT/upsert hit the primary key either way pointlessly). */
export async function leaveRoom(roomId: string): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession()
  const userId = sessionData.session?.user.id
  if (!userId) return
  await supabase.from('room_players').delete().eq('room_id', roomId).eq('user_id', userId)
}

/** Best-effort version of leaveRoom for a closed tab, not a tapped button —
 * there's no async work happening once a tab is actually closing, so this
 * reads the session straight out of localStorage (synchronous) and fires a
 * `keepalive` fetch directly at the REST API, bypassing the Supabase client
 * entirely. Not guaranteed to land (browsers can and do drop unload-time
 * requests), but it's the only shot available, and better than the row
 * lingering forever with no attempt at all. */
export function leaveRoomOnUnload(roomId: string): void {
  try {
    const raw = localStorage.getItem('sb-uockbafewpevbpxfelde-auth-token')
    if (!raw) return
    const parsed = JSON.parse(raw) as { access_token?: string; user?: { id?: string } }
    const accessToken = parsed.access_token
    const userId = parsed.user?.id
    if (!accessToken || !userId) return

    const anonKey = 'sb_publishable_4v8Z4pmzHHHAUXD2v-z2Ew_rly0xL2q'
    fetch(
      `https://uockbafewpevbpxfelde.supabase.co/rest/v1/room_players?room_id=eq.${roomId}&user_id=eq.${userId}`,
      {
        method: 'DELETE',
        keepalive: true,
        headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
      },
    )
  } catch {
    // best-effort only — nothing to recover from here
  }
}

export async function fetchRoom(roomId: string): Promise<DBRoom> {
  const { data, error } = await supabase.from('rooms').select().eq('id', roomId).single()
  if (error || !data) throw error ?? new Error('Room not found')
  return data as DBRoom
}

export async function fetchPlayers(roomId: string): Promise<DBRoomPlayer[]> {
  const { data, error } = await supabase
    .from('room_players')
    .select()
    .eq('room_id', roomId)
    .order('score', { ascending: false })
  if (error) throw error
  return data as DBRoomPlayer[]
}

/** Whether this player has already answered a given question — lets a page
 * refresh mid-round land back on the reveal instead of re-showing the picker
 * and hitting the edge function's "already answered" conflict. */
export async function fetchExistingAnswer(
  roomId: string,
  questionIndex: number,
  userId: string
): Promise<{ submitted_noun: string; is_correct: boolean } | null> {
  const { data } = await supabase
    .from('round_answers')
    .select('submitted_noun, is_correct')
    .eq('room_id', roomId)
    .eq('question_index', questionIndex)
    .eq('user_id', userId)
    .maybeSingle()
  return data
}

/** Mirrors GameService.fetchRoundAnswers(roomId:questionIndex:) — points
 * each player scored on this specific round, keyed by user_id, so the
 * results table can show "+N this round" alongside the running total. */
export async function fetchRoundAnswers(roomId: string, questionIndex: number): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('round_answers')
    .select('user_id, points_awarded')
    .eq('room_id', roomId)
    .eq('question_index', questionIndex)
  if (error) throw error
  const result: Record<string, number> = {}
  for (const row of data as { user_id: string; points_awarded: number }[]) {
    if (!(row.user_id in result)) result[row.user_id] = row.points_awarded
  }
  return result
}

export async function submitAnswer(
  roomId: string,
  questionIndex: number,
  submittedAnimal: string
): Promise<SubmitAnswerResponse> {
  const { data, error } = await supabase.functions.invoke('submit-answer', {
    body: { room_id: roomId, question_index: questionIndex, submitted_animal: submittedAnimal },
  })
  if (error) throw error
  return data as SubmitAnswerResponse
}

/** Fires `onChange` on every insert/update to this room's row — the only way
 * a non-host guest finds out the host started the game or moved to the next
 * question, since navigation is otherwise entirely local to whoever clicked. */
export function observeRoom(roomId: string, onChange: (room: DBRoom) => void) {
  const channel = supabase
    .channel(`room-${roomId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
      (payload) => onChange(payload.new as DBRoom)
    )
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}

export function observePlayers(roomId: string, onChange: (players: DBRoomPlayer[]) => void) {
  const channel = supabase
    .channel(`room-players-${roomId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` },
      () => {
        fetchPlayers(roomId).then(onChange).catch(() => {})
      }
    )
    .subscribe()
  fetchPlayers(roomId).then(onChange).catch(() => {})
  return () => {
    supabase.removeChannel(channel)
  }
}
