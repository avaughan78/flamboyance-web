export interface DBAnimal {
  id: string
  name: string
  category: string
  plural_name: string
}

export interface DBCollectiveNoun {
  id: string
  animal_id: string
  noun: string
  rarity: string
  etymology: string | null
}

/** A player-submitted collective noun for anything, not just animals —
 * mirrors DBCommunityNoun in the native apps' GameModels.swift/Models.kt. */
export interface DBCommunityNoun {
  id: string
  noun: string
  thing_name: string
  description: string | null
  status: string
  likes_count: number
}

/** Which content a room/session is drawing questions from — official
 * animals/collective_nouns, or player-submitted community_nouns. Mirrors
 * ContentPool in the native apps. */
export type ContentPool = 'original' | 'community'

export interface DBRoom {
  id: string
  code: string
  host_id: string
  status: 'lobby' | 'active' | 'finished' | 'cancelled'
  current_question_index: number
  question_ids: string[]
  max_players: number
  question_started_at: string
  is_rated: boolean
  forfeited_user_id: string | null
  content_pool: ContentPool
}

export interface DBRoomPlayer {
  room_id: string
  user_id: string
  display_name: string
  score: number
  rating_delta: number | null
  ready_at: string | null
  ready_round: number | null
}

export interface SubmitAnswerResponse {
  is_correct: boolean
  points_awarded: number
}

export interface DBGameSession {
  id: string
  mode: 'duel' | 'party'
  host_id: string
  status: 'waiting' | 'ready_gate' | 'playing' | 'final_round' | 'completed' | 'cancelled'
  current_question_index: number
  total_questions: number
  game_code: string
  question_ids: string[]
  question_started_at: string
  standings_gate_initiated_at: string | null
  standings_gate_timeout_at: string | null
  max_players: number
  content_pool: ContentPool
}

export interface DBGamePlayer {
  id: string
  game_session_id: string
  user_id: string
  display_name: string
  ready_at: string | null
  current_screen: string
  current_question_index: number
  last_heartbeat_at: string
  disconnected_at: string | null
  score: number
}
