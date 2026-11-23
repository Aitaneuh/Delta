/**
 * Guesses the rating a player performed at in one game. One game is a small sample, so treat
 * the result as a hint, not a measurement.
 *
 * When the game records the player's rating, that rating is the starting point and the game
 * moves it up or down by how their accuracy compares with what is typical at that level.
 * Otherwise the guess comes from average centipawn loss alone, which can't tell strong players
 * apart: near-perfect play at 2800 and at 3200 looks the same.
 */
import type { PlayerReport } from './moveScoring'

/** Fewer graded moves than this say too little to guess a rating. */
export const MIN_MOVES_FOR_ESTIMATE = 8

const MIN_ELO = 400
const MAX_ELO = 3000

// Rated games: Elo gained or lost per accuracy point above or below the expected accuracy,
// and the most one game can move the rating (halved for short games)
const ELO_PER_ACCURACY_POINT = 25
const MAX_ADJUSTMENT = 300
const MIN_RATED_ELO = 100
const MAX_RATED_ELO = 3500

export interface EloEstimate {
  elo: number
  // Short games give a much rougher guess
  confidence: 'low' | 'normal'
  // True when the guess starts from the player's recorded rating
  fromRating: boolean
}

const roundTo25 = (elo: number) => Math.round(elo / 25) * 25

/** Higher centipawn loss means a lower rating: about 2300 at 30 cp, 1700 at 60, 1100 at 100. */
export function eloFromAverageCpLoss(averageCpLoss: number): number {
  const elo = 3100 * Math.exp(-0.01 * Math.max(0, averageCpLoss))
  return roundTo25(Math.min(MAX_ELO, Math.max(MIN_ELO, elo)))
}

/** The game accuracy a player of this rating typically reaches: about 70% at 1200, 92% at 3000. */
export function expectedAccuracy(elo: number): number {
  return Math.min(96, Math.max(50, 55 + elo * 0.0125))
}

/** The recorded rating, moved by how much better or worse than expected the player did. */
export function eloFromRating(rating: number, accuracy: number, shortGame = false): number {
  const limit = shortGame ? MAX_ADJUSTMENT / 2 : MAX_ADJUSTMENT
  const adjustment = (accuracy - expectedAccuracy(rating)) * ELO_PER_ACCURACY_POINT
  const elo = rating + Math.min(limit, Math.max(-limit, adjustment))
  return roundTo25(Math.min(MAX_RATED_ELO, Math.max(MIN_RATED_ELO, elo)))
}

export function estimateElo(
  report: PlayerReport,
  movesPlayed: number,
  rating: number | null = null,
): EloEstimate | null {
  if (movesPlayed < MIN_MOVES_FOR_ESTIMATE) return null
  const shortGame = movesPlayed < 20
  const confidence = shortGame ? 'low' : 'normal'

  if (rating && rating > 0) {
    return {
      elo: eloFromRating(rating, report.accuracy, shortGame),
      confidence,
      fromRating: true,
    }
  }
  return { elo: eloFromAverageCpLoss(report.averageCpLoss), confidence, fromRating: false }
}
