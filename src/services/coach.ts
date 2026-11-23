/**
 * The coach: explains a move in plain words, from the engine's evaluations before and after it.
 * It runs entirely in the browser with simple board checks (hanging pieces, forks, mates, missed
 * captures), so it needs no outside service. It only describes what the engine's single best
 * reply or best alternative shows; deeper reasons fall back to describing the evaluation swing.
 */
import { attacks } from 'chessops/attacks'
import { Chess, normalizeMove } from 'chessops/chess'
import { parseFen } from 'chessops/fen'
import { parseSan } from 'chessops/san'
import { isNormal, type Color, type NormalMove, type Role } from 'chessops/types'
import { makeSquare, opposite, parseUci } from 'chessops/util'
import { formatEval } from './gameAnalysis'
import { whiteWinPercent, type MoveGrade, type PositionEval } from './moveScoring'

export interface CoachInput {
  fenBefore: string
  san: string // The move played
  before: PositionEval // Evaluation of fenBefore; its best move is the engine's choice there
  after: PositionEval // Evaluation after the move; its best move is the opponent's best reply
  grade: MoveGrade | null
  previousGrade?: MoveGrade | null // The grade of the opponent's move just before
}

export type CoachTone = 'best' | 'good' | MoveGrade

export interface CoachComment {
  tone: CoachTone
  headline: string
  details: string[]
}

const VALUES: Record<Role, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 100 }

const SIDE: Record<Color, string> = { white: 'White', black: 'Black' }

const bare = (san: string | null | undefined) => san?.replace(/[+#!?]/g, '') ?? null

function positionFromFen(fen: string): Chess | null {
  const setup = parseFen(fen)
  if (setup.isErr) return null
  const position = Chess.fromSetup(setup.value)
  return position.isOk ? position.value : null
}

/** A UCI or SAN move as a normal (non-drop) move in this position, castling normalized. */
function toMove(position: Chess, move: string, notation: 'uci' | 'san'): NormalMove | null {
  const parsed = notation === 'uci' ? parseUci(move) : parseSan(position, move)
  if (!parsed || !isNormal(parsed)) return null
  const normal = normalizeMove(position, parsed)
  return isNormal(normal) && position.isLegal(normal) ? normal : null
}

/** The winning chances of `color`, 0 to 100. */
function winPercentFor(color: Color, evaluation: PositionEval): number {
  const white = whiteWinPercent(evaluation.cp)
  return color === 'white' ? white : 100 - white
}

function describeStanding(winPercent: number): string {
  if (winPercent >= 85) return 'winning'
  if (winPercent >= 65) return 'clearly better'
  if (winPercent >= 55) return 'slightly better'
  if (winPercent > 45) return 'about equal'
  if (winPercent > 35) return 'slightly worse'
  if (winPercent > 15) return 'clearly worse'
  return 'losing'
}

/** Moves to mate for `color`, or null if `color` has no forced mate. */
function mateFor(color: Color, evaluation: PositionEval): number | null {
  if (evaluation.mate === null || evaluation.mate === 0) return null
  const whiteMates = evaluation.mate > 0
  return whiteMates === (color === 'white') ? Math.abs(evaluation.mate) : null
}

const isDefended = (position: Chess, square: number, by: Color) =>
  position.kingAttackers(square, by, position.board.occupied).nonEmpty()

interface Capture {
  role: Role // The piece taken
  square: string
  capturer: Role
  wins: boolean // Undefended, or worth more than the piece that takes it
}

/** What a move captures, and whether it simply wins that piece. */
function describeCapture(position: Chess, move: NormalMove): Capture | null {
  const victim = position.board.get(move.to)
  const capturer = position.board.get(move.from)
  if (!victim || !capturer || victim.color === capturer.color) return null

  const after = position.clone()
  after.play(move)
  const recapturable = isDefended(after, move.to, victim.color)
  return {
    role: victim.role,
    square: makeSquare(move.to),
    capturer: capturer.role,
    wins: !recapturable || VALUES[victim.role] > VALUES[capturer.role],
  }
}

/** The pieces a move attacks at once: two or more valuable targets make a fork. */
function describeFork(position: Chess, move: NormalMove): Role[] | null {
  const piece = position.board.get(move.from)
  if (!piece) return null

  const after = position.clone()
  after.play(move)
  if (after.isCheckmate()) return null

  const enemy = opposite(piece.color)
  const targets = attacks(piece, move.to, after.board.occupied).intersect(after.board[enemy])
  // The forking piece must survive long enough to take something
  const safe = !isDefended(after, move.to, enemy) || VALUES[piece.role] <= 1

  const valuable: Role[] = []
  for (const square of targets) {
    const target = after.board.get(square)!
    if (target.role === 'pawn') continue
    if (
      target.role === 'king' ||
      VALUES[target.role] > VALUES[piece.role] ||
      !isDefended(after, square, enemy)
    ) {
      valuable.push(target.role)
    }
  }
  return valuable.length >= 2 && (safe || valuable.includes('king')) ? valuable : null
}

const listRoles = (roles: Role[]) => {
  const names = [...roles].sort((a, b) => (a === 'king' ? -1 : b === 'king' ? 1 : 0))
  return names.length > 1
    ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
    : names[0]!
}

const article = (word: string) => (/^[aeiou]/.test(word) ? `an ${word}` : `a ${word}`)

function gradeHeadline(san: string, grade: MoveGrade): string {
  if (grade === 'blunder') return `${san} is a blunder.`
  if (grade === 'mistake') return `${san} is a mistake.`
  return `${san} is an inaccuracy.`
}

/** Why a bad move was bad: what the opponent can now do. */
function explainThreat(input: CoachInput, mover: Color, played: NormalMove): string[] {
  const details: string[] = []
  const opponent = opposite(mover)
  const position = positionFromFen(input.fenBefore)
  if (!position) return details
  const afterMove = position.clone()
  afterMove.play(played)

  const mateAgainst = mateFor(opponent, input.after)
  if (mateAgainst !== null) {
    const start = input.after.bestSan ? `, starting with ${input.after.bestSan}` : ''
    details.push(
      mateAgainst === 1
        ? `It allows ${input.after.bestSan ?? 'mate'}, checkmate.`
        : `It allows ${SIDE[opponent]} a forced mate in ${mateAgainst}${start}.`,
    )
    return details
  }

  const reply = input.after.best ? toMove(afterMove, input.after.best, 'uci') : null
  if (!reply) return details
  const replySan = input.after.bestSan ?? makeSquare(reply.to)

  // Taking back on the square the move just captured on is a trade, not a loss, unless the piece
  // given up is worth more
  const gained = position.board.get(played.to)
  const capture = describeCapture(afterMove, reply)
  const isTrade =
    !!capture &&
    !!gained &&
    gained.color !== mover &&
    reply.to === played.to &&
    VALUES[capture.role] <= VALUES[gained.role]
  if (capture?.wins && !isTrade) {
    const movedHere = reply.to === played.to
    const where = `${capture.role} on ${capture.square}`
    if (movedHere) {
      details.push(
        isDefended(afterMove, reply.to, mover)
          ? `The ${where} can be taken by a cheaper piece: ${replySan} wins material.`
          : `It puts the ${where} where it can simply be taken: ${replySan}.`,
      )
    } else {
      const wasSafe = (() => {
        const threatened = position.clone()
        // Was the piece already hanging before the move? Check by giving the opponent the move.
        threatened.turn = opponent
        threatened.epSquare = undefined
        const sameReply = toMove(threatened, input.after.best!, 'uci')
        return !sameReply || !describeCapture(threatened, sameReply)?.wins
      })()
      details.push(
        wasSafe
          ? `It leaves the ${where} unprotected, and ${SIDE[opponent]} takes it with ${replySan}.`
          : `The ${where} was under attack and still is: ${SIDE[opponent]} takes it with ${replySan}.`,
      )
    }
    return details
  }

  const fork = describeFork(afterMove, reply)
  if (fork) {
    const forker = afterMove.board.get(reply.from)!.role
    details.push(
      `It allows ${replySan}, ${article(forker)} fork that attacks the ${listRoles(fork)} at once.`,
    )
    return details
  }

  const check = afterMove.clone()
  check.play(reply)
  details.push(
    check.isCheck()
      ? `${SIDE[opponent]} answers with ${replySan}, a strong check.`
      : `${SIDE[opponent]}'s best reply is ${replySan}.`,
  )
  return details
}

/** What the player could have done instead. */
function explainMissed(input: CoachInput, mover: Color): string[] {
  const position = positionFromFen(input.fenBefore)
  const best = input.before.best && position ? toMove(position, input.before.best, 'uci') : null
  const bestSan = input.before.bestSan
  if (!position || !best || !bestSan) return []

  const mate = mateFor(mover, input.before)
  if (mate !== null) {
    return [
      mate === 1
        ? `${bestSan} was checkmate.`
        : `${SIDE[mover]} had a forced mate in ${mate}, starting with ${bestSan}.`,
    ]
  }

  const capture = describeCapture(position, best)
  if (capture?.wins) return [`${SIDE[mover]} missed ${bestSan}, which wins the ${capture.role}.`]

  const fork = describeFork(position, best)
  if (fork) {
    const forker = position.board.get(best.from)!.role
    return [`${SIDE[mover]} missed ${bestSan}, ${article(forker)} fork of the ${listRoles(fork)}.`]
  }

  return [`Better was ${bestSan}.`]
}

function describeSwing(mover: Color, input: CoachInput): string {
  const before = describeStanding(winPercentFor(mover, input.before))
  const after = describeStanding(winPercentFor(mover, input.after))
  const scores = `(${formatEval(input.before)} → ${formatEval(input.after)})`
  if (before === after) return `${SIDE[mover]} is still ${after}, but with less margin ${scores}.`
  return `${SIDE[mover]} goes from ${before} to ${after} ${scores}.`
}

/** Explains the move. Returns null when the move can't be read in this position. */
export function coachMove(input: CoachInput): CoachComment | null {
  const position = positionFromFen(input.fenBefore)
  if (!position) return null
  const mover = position.turn
  const played = toMove(position, input.san, 'san')
  if (!played) return null

  const isBest = bare(input.san) === bare(input.before.bestSan)
  const opponentErred = input.previousGrade === 'mistake' || input.previousGrade === 'blunder'

  if (input.after.mate === 0) {
    return { tone: 'best', headline: `${input.san} is checkmate.`, details: [] }
  }

  if (!input.grade) {
    const details: string[] = []
    const capture = describeCapture(position, played)
    const fork = describeFork(position, played)
    const mate = mateFor(mover, input.after)
    if (mate !== null) {
      details.push(`${SIDE[mover]} now has a forced mate in ${mate}.`)
    } else if (fork) {
      details.push(`It forks the ${listRoles(fork)}.`)
    } else if (capture?.wins) {
      details.push(`It wins the ${capture.role} on ${capture.square}.`)
    }
    if (opponentErred) details.push(`It makes the most of ${SIDE[opposite(mover)]}'s last move.`)
    if (!isBest && input.before.bestSan) {
      details.push(`The engine slightly preferred ${input.before.bestSan}.`)
    }
    return {
      tone: isBest ? 'best' : 'good',
      headline: isBest ? `${input.san} is the best move.` : `${input.san} is a good move.`,
      details,
    }
  }

  const details = [...explainThreat(input, mover, played)]
  if (opponentErred) {
    details.push(
      `${SIDE[opposite(mover)]}'s last move was a mistake, and this lets the chance slip.`,
    )
  }
  details.push(...explainMissed(input, mover))
  details.push(describeSwing(mover, input))

  return { tone: input.grade, headline: gradeHeadline(input.san, input.grade), details }
}
