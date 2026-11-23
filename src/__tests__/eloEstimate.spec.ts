import { describe, it, expect } from 'vitest'
import {
  eloFromAverageCpLoss,
  eloFromRating,
  estimateElo,
  expectedAccuracy,
} from '../services/eloEstimate'
import type { PlayerReport } from '../services/moveScoring'

const report = (averageCpLoss: number, accuracy = 80): PlayerReport => ({
  accuracy,
  averageCpLoss,
  inaccuracies: 0,
  mistakes: 0,
  blunders: 0,
})

describe('eloFromAverageCpLoss', () => {
  it('maps lower centipawn loss to a higher rating, rounded to 25', () => {
    expect(eloFromAverageCpLoss(30)).toBe(2300)
    expect(eloFromAverageCpLoss(60)).toBe(1700)
    expect(eloFromAverageCpLoss(100)).toBe(1150)
  })

  it('stays within a believable range', () => {
    expect(eloFromAverageCpLoss(0)).toBe(3000)
    expect(eloFromAverageCpLoss(500)).toBe(400)
  })
})

describe('estimateElo', () => {
  it('needs enough moves to guess', () => {
    expect(estimateElo(report(40), 5)).toBeNull()
  })

  it('marks short games as a rough guess', () => {
    expect(estimateElo(report(40), 12)).toEqual({ elo: 2075, confidence: 'low', fromRating: false })
    expect(estimateElo(report(40), 30)?.confidence).toBe('normal')
  })
})

describe('eloFromRating', () => {
  it('keeps a strong player near their rating when they play near-perfectly', () => {
    // A 3200 playing at 99% shouldn't drop to the centipawn-loss scale's 2800-3000
    expect(eloFromRating(3200, 99)).toBe(3300)
  })

  it('moves the rating with accuracy, within a limit', () => {
    expect(eloFromRating(1500, expectedAccuracyAt1500())).toBe(1500)
    expect(eloFromRating(1500, 100)).toBe(1800)
    expect(eloFromRating(1500, 30)).toBe(1200)
    expect(eloFromRating(1500, 30, true)).toBe(1350)
  })
})

describe('estimateElo with a recorded rating', () => {
  it('starts from the rating when the game has one', () => {
    expect(estimateElo(report(10, 99), 30, 3200)).toEqual({
      elo: 3300,
      confidence: 'normal',
      fromRating: true,
    })
  })

  it('falls back to centipawn loss without a rating', () => {
    expect(estimateElo(report(30), 30, null)).toMatchObject({ elo: 2300, fromRating: false })
  })
})

function expectedAccuracyAt1500() {
  return expectedAccuracy(1500)
}
