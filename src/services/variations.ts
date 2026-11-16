/**
 * Moves played on the board while exploring a game. A variation branches off the main line
 * after `startIndex` moves and is never saved: it only lives in the visitor's browser.
 */
import { Chess, normalizeMove } from 'chessops/chess'
import { chessgroundDests, chessgroundMove } from 'chessops/compat'
import { makeFen, parseFen } from 'chessops/fen'
import { makeSan } from 'chessops/san'
import type { Color, NormalMove, SquareName } from 'chessops/types'
import { parseSquare } from 'chessops/util'
import type { BoardPosition } from './pgnParser'

export interface VariationMove extends BoardPosition {
  san: string
  moveNumber: number // The full-move number shown before the move, e.g. 12 in "12... Nf6"
  color: Color // The side that played it
}

export interface Variation {
  id: number
  startIndex: number // Main-line position it branches from (0 is the starting position)
  moves: VariationMove[]
}

function positionFromFen(fen: string): Chess | null {
  const setup = parseFen(fen)
  if (setup.isErr) return null
  const position = Chess.fromSetup(setup.value)
  return position.isOk ? position.value : null
}

/** The squares each piece can move to, in the format the board expects. */
export function legalDests(fen: string): Map<SquareName, SquareName[]> {
  const position = positionFromFen(fen)
  return position ? chessgroundDests(position) : new Map()
}

/**
 * Plays a move dragged on the board. Pawns reaching the last rank become queens.
 * Returns null if the move isn't legal.
 */
export function playMove(fen: string, orig: string, dest: string): VariationMove | null {
  const position = positionFromFen(fen)
  const from = parseSquare(orig)
  const to = parseSquare(dest)
  if (!position || from === undefined || to === undefined) return null

  const raw: NormalMove = { from, to }
  const piece = position.board.get(from)
  const lastRank = position.turn === 'white' ? 7 : 0
  if (piece?.role === 'pawn' && Math.floor(to / 8) === lastRank) raw.promotion = 'queen'

  // The board sends castling as "king two squares"; chessops wants "king takes rook"
  const move = normalizeMove(position, raw)
  if (!position.isLegal(move)) return null

  const color = position.turn
  const moveNumber = position.fullmoves
  const san = makeSan(position, move)
  position.play(move)

  return {
    san,
    moveNumber,
    color,
    fen: makeFen(position.toSetup()),
    lastMove: chessgroundMove(move),
    check: position.isCheck() ? position.turn : false,
  }
}
