import { describe, it, expect } from 'vitest'
import { coachMove, type CoachInput } from '../services/coach'
import type { PositionEval } from '../services/gameAnalysis'

const evalOf = (
  cp: number,
  best: string | null = null,
  bestSan: string | null = null,
  mate: number | null = null,
): PositionEval => ({ cp, mate, best, bestSan })

const coach = (input: Partial<CoachInput> & Pick<CoachInput, 'fenBefore' | 'san'>) =>
  coachMove({ before: evalOf(0), after: evalOf(0), grade: null, ...input })

describe('coachMove', () => {
  it('explains a piece moved to where it can be taken', () => {
    const comment = coach({
      fenBefore: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 2',
      san: 'Ng5',
      before: evalOf(30, 'b1c3', 'Nc3'),
      after: evalOf(-300, 'd8g5', 'Qxg5'),
      grade: 'blunder',
    })

    expect(comment?.tone).toBe('blunder')
    expect(comment?.headline).toBe('Ng5 is a blunder.')
    expect(comment?.details[0]).toBe('It puts the knight on g5 where it can simply be taken: Qxg5.')
    expect(comment?.details).toContain('Better was Nc3.')
  })

  it('explains a fork the move allows', () => {
    const comment = coach({
      fenBefore: '4k3/8/8/8/1n6/8/4K3/R7 w - - 0 1',
      san: 'Ke1',
      before: evalOf(400, 'e2d2', 'Kd2'),
      after: evalOf(-200, 'b4c2', 'Nc2+'),
      grade: 'blunder',
    })

    expect(comment?.details[0]).toBe(
      'It allows Nc2+, a knight fork that attacks the king and rook at once.',
    )
  })

  it('points out a missed checkmate', () => {
    const comment = coach({
      fenBefore: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1',
      san: 'Kf1',
      before: evalOf(10000, 'a1a8', 'Ra8#', 1),
      after: evalOf(500, 'g8f8', 'Kf8'),
      grade: 'blunder',
    })

    expect(comment?.details).toContain('Ra8# was checkmate.')
  })

  it('warns about an allowed forced mate', () => {
    const comment = coach({
      fenBefore: '6k1/5ppp/8/8/8/8/r4PPP/6K1 b - - 0 1',
      san: 'Kf8',
      before: evalOf(-500, 'a2a1', 'Ra1+'),
      after: evalOf(10000, 'g1f1', 'Kf1', 3),
      grade: 'blunder',
    })

    expect(comment?.details[0]).toBe('It allows White a forced mate in 3, starting with Kf1.')
  })

  it('does not call a fair trade a lost piece', () => {
    const comment = coach({
      fenBefore: 'rnbqkb1r/pppppppp/5n2/6B1/8/3P4/PPP1PPPP/RN1QKBNR w KQkq - 2 3',
      san: 'Bxf6',
      before: evalOf(60, 'b1d2', 'Nd2'),
      after: evalOf(0, 'e7f6', 'exf6'),
      grade: 'inaccuracy',
    })

    expect(comment?.details[0]).toBe("Black's best reply is exf6.")
    expect(comment?.details.join(' ')).toContain('goes from slightly better to about equal')
  })

  it('praises the engine’s move and notes what it wins', () => {
    const comment = coach({
      fenBefore: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 2',
      san: 'Nxe5',
      before: evalOf(50, 'f3e5', 'Nxe5'),
      after: evalOf(150),
    })

    expect(comment).toEqual({
      tone: 'best',
      headline: 'Nxe5 is the best move.',
      details: ['It wins the pawn on e5.'],
    })
  })

  it('recognizes checkmate', () => {
    const comment = coach({
      fenBefore: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1',
      san: 'Ra8#',
      after: evalOf(10000, null, null, 0),
    })
    expect(comment?.headline).toBe('Ra8# is checkmate.')
  })

  it('returns null for a move that is not legal in the position', () => {
    expect(coach({ fenBefore: '6k1/8/8/8/8/8/8/6K1 w - - 0 1', san: 'Qh5' })).toBeNull()
  })
})
