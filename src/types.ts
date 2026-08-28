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
