import type { DBAnimal, DBCollectiveNoun } from '../types'

const MASK64 = 0xffffffffffffffffn

/**
 * A tiny deterministic PRNG (splitmix64, public domain, Sebastiano Vigna)
 * plus a hand-rolled Fisher-Yates shuffle — deliberately not
 * `Array.prototype.sort(() => Math.random() - 0.5)` or any built-in, whose
 * exact algorithm isn't guaranteed to match anything on iOS/Android. This
 * is a bit-for-bit port of `SeededShuffler` (Flamboyance/Backend/
 * SeededShuffle.swift) so all three clients, given the same seed, land on
 * the exact same permutation — used so Duel/Party players see the same
 * multiple-choice options for a given question instead of each device
 * rolling its own independent draw.
 */
class Splitmix64 {
  private state: bigint

  constructor(seed: bigint) {
    this.state = seed & MASK64
  }

  next(): bigint {
    this.state = (this.state + 0x9e3779b97f4a7c15n) & MASK64
    let z = this.state
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK64
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK64
    return z ^ (z >> 31n)
  }
}

function shuffleInPlaceSeeded<T>(arr: T[], rng: Splitmix64): void {
  if (arr.length <= 1) return
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Number(rng.next() % BigInt(i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
}

/** FNV-1a 64-bit. Deterministic seed derivation from a string — identical
 * output on every platform given identical input bytes, unlike any
 * language's built-in string hashing, which is typically salted per-process. */
export function fnv1aHash64(input: string): bigint {
  let hash = 0xcbf29ce484222325n
  const bytes = new TextEncoder().encode(input)
  for (const byte of bytes) {
    hash ^= BigInt(byte)
    hash = (hash * 0x100000001b3n) & MASK64
  }
  return hash
}

/**
 * The noun is given ("a crash of ______"); the player guesses the animal.
 * Returns the correct animal's plural name plus a seeded-shuffled set of 4
 * options (3 distractor animals). Bit-for-bit port of
 * `GameService.choices(for:seed:)` — same candidate sort, same dedupe, same
 * two-shuffler split (one for which distractors, one for their on-screen
 * order) — so web lands on the identical option set as iOS/Android given
 * the same room/session id + question index.
 */
export function choices(
  animals: DBAnimal[],
  nouns: DBCollectiveNoun[],
  nounId: string,
  seed: string
): { correct: string; options: string[] } {
  const noun = nouns.find((n) => n.id === nounId)
  if (!noun) return { correct: '', options: [] }
  const correctAnimal = animals.find((a) => a.id === noun.animal_id)
  if (!correctAnimal) return { correct: '', options: [] }

  const animalIdsSharingThisNoun = new Set(
    nouns.filter((n) => n.noun.toLowerCase() === noun.noun.toLowerCase()).map((n) => n.animal_id)
  )

  // Sorted by id first so every client starts from the identical ordering
  // before shuffling — Postgres makes no row-order guarantee without an
  // ORDER BY, so the locally-cached animals arrays could otherwise differ
  // in order even with identical rows and an identical seed.
  const candidates = animals
    .filter((a) => !animalIdsSharingThisNoun.has(a.id))
    .sort((a, b) => a.id.toLowerCase().localeCompare(b.id.toLowerCase()))
  shuffleInPlaceSeeded(candidates, new Splitmix64(fnv1aHash64(seed)))

  const seenNames = new Set([correctAnimal.plural_name.toLowerCase()])
  const distractors: string[] = []
  for (const candidate of candidates) {
    const key = candidate.plural_name.toLowerCase()
    if (seenNames.has(key)) continue
    seenNames.add(key)
    distractors.push(candidate.plural_name)
    if (distractors.length === 3) break
  }

  const options = [...distractors, correctAnimal.plural_name]
  shuffleInPlaceSeeded(options, new Splitmix64(fnv1aHash64(seed + '-order')))
  return { correct: correctAnimal.plural_name, options }
}
