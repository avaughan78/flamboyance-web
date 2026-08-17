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
 * Returns the correct noun and a shuffled set of 4 options. Distractors are
 * deduped by lowercased *text*, not just animal id — many unrelated animals
 * legitimately share a noun (e.g. "Herd"), so animal-only dedup let the same
 * word appear twice as separate options. Mirrors GameService.choices(for:)
 * in the iOS app exactly, so web and native players see equally-fair rounds.
 */
export function choices(nouns: DBCollectiveNoun[], nounId: string): { correct: string; options: string[] } {
  const noun = nouns.find((n) => n.id === nounId)
  if (!noun) return { correct: '', options: [] }

  const seenTexts = new Set([noun.noun.toLowerCase()])
  const distractors: string[] = []
  const candidates = nouns.filter((n) => n.animal_id !== noun.animal_id)
  shuffleInPlace(candidates)
  for (const candidate of candidates) {
    const key = candidate.noun.toLowerCase()
    if (seenTexts.has(key)) continue
    seenTexts.add(key)
    distractors.push(candidate.noun)
    if (distractors.length === 3) break
  }

  const options = [...distractors, noun.noun]
  shuffleInPlace(options)
  return { correct: noun.noun, options }
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

  const { error: joinError } = await supabase
    .from('room_players')
    .insert({ room_id: room.id, user_id: userId, display_name: displayName })
  // Ignore "already joined" conflicts (e.g. a page refresh) — everything else should surface.
  if (joinError && joinError.code !== '23505') throw joinError

  return room as DBRoom
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

export async function submitAnswer(
  roomId: string,
  questionIndex: number,
  submittedNoun: string
): Promise<SubmitAnswerResponse> {
  const { data, error } = await supabase.functions.invoke('submit-answer', {
    body: { room_id: roomId, question_index: questionIndex, submitted_noun: submittedNoun },
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
