import { describe, it, expect } from 'vitest'
import { legalDests, playMove } from '../services/variations'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

describe('variation moves', () => {
  it('lists the legal moves for the side to move', () => {
    const dests = legalDests(START)
    expect(dests.get('e2')).toEqual(['e3', 'e4'])
    expect(dests.has('e7')).toBe(false)
  })

  it('plays a move with its SAN, number and resulting position', () => {
    expect(playMove(START, 'g1', 'f3')).toMatchObject({
      san: 'Nf3',
      moveNumber: 1,
      color: 'white',
      fen: 'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1',
      check: false,
    })
  })

  it('refuses illegal moves', () => {
    expect(playMove(START, 'e2', 'e5')).toBeNull()
    expect(playMove(START, 'e7', 'e5')).toBeNull()
    expect(playMove('not a fen', 'e2', 'e4')).toBeNull()
  })

  it('castles when the king moves two squares', () => {
    const fen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'
    expect(playMove(fen, 'e1', 'g1')).toMatchObject({
      san: 'O-O',
      fen: 'r3k2r/8/8/8/8/8/8/R4RK1 b kq - 1 1',
    })
  })

  it('promotes to a queen and reports check', () => {
    const move = playMove('4k3/P7/8/8/8/8/8/4K3 w - - 0 1', 'a7', 'a8')
    expect(move).toMatchObject({ san: 'a8=Q+', check: 'black' })
  })
})
