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
  status: 'lobby' | 'active' | 'finished'
  current_question_index: number
  question_ids: string[]
  max_players: number
}

export interface DBRoomPlayer {
  room_id: string
  user_id: string
  display_name: string
  score: number
}

export interface SubmitAnswerResponse {
  is_correct: boolean
  points_awarded: number
}
