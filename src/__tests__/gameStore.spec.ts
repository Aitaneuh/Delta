import { beforeEach, describe, it, expect, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { createEmptyFilters, useGameStore } from '../stores/gameStore'
import { parsePGN } from '../services/pgnParser'
import { EngineStoppedError, type PositionEvaluator } from '../services/engine'

const [game] = parsePGN('[White "a"]\n[Black "b"]\n\n1. e4 c5 2. d4 cxd4 *')

interface Call {
  url: string
  method: string
  body: unknown
}

let calls: Call[]

function stubApi(respond: (call: Call) => unknown = () => ({})) {
  calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const call = {
        url,
        method: init.method ?? 'GET',
        body: init.body ? JSON.parse(init.body as string) : undefined,
      }
      calls.push(call)
      if (call.url.startsWith('/api/missing')) {
        return new Response(JSON.stringify({ error: 'Game not found.' }), { status: 404 })
      }
      return new Response(JSON.stringify(respond(call)), { status: 200 })
    }),
  )
}

const evaluator =
  (cp = 12) =>
  () => ({
    evaluate: async () => ({ cp, mate: null, best: 'e2e4' }),
    terminate: () => {},
  })

describe('game store', () => {
  beforeEach(() => {
    stubApi((call) => (call.method === 'PUT' ? call.body : game))
    setActivePinia(createPinia())
  })

  it('sends the sort order and restarts from the first page when it changes', async () => {
    stubApi(() => ({ games: [], total: 60, page: 1, pageSize: 25 }))
    const store = useGameStore()

    await store.goToPage(1)
    expect(calls[0]!.url).toContain('sort=played')
    await store.goToPage(2)
    await store.setSort('accuracy_low')

    const query = new URLSearchParams(calls[calls.length - 1]!.url.split('?')[1])
    expect(query.get('sort')).toBe('accuracy_low')
    expect(query.get('page')).toBe('1')
  })

  it('sends filters to the server and goes back to the first page', async () => {
    stubApi(() => ({ games: [], total: 60, page: 1, pageSize: 25 }))
    const store = useGameStore()

    await store.goToPage(1)
    expect(store.totalPages).toBe(3)
    await store.goToPage(3)
    expect(calls[calls.length - 1]!.url).toContain('page=3')

    await store.updateFilters({
      ...createEmptyFilters(),
      player_name: 'alice',
      game_types: ['blitz', 'rapid'],
      min_elo: 1500,
      max_elo: '',
      analyzed_only: true,
    })

    const query = new URLSearchParams(calls[calls.length - 1]!.url.split('?')[1])
    expect(query.get('page')).toBe('1')
    expect(query.get('player_name')).toBe('alice')
    expect(query.getAll('game_types')).toEqual(['blitz', 'rapid'])
    expect(query.get('min_elo')).toBe('1500')
    expect(query.has('max_elo')).toBe(false)
    expect(query.has('eco_code')).toBe(false)
    expect(query.get('analyzed_only')).toBe('true')
  })

  it('confirms permanence when uploading', async () => {
    const store = useGameStore()
    await store.importPgn('1. e4 *')
    expect(calls[0]).toMatchObject({
      url: '/api/games',
      method: 'POST',
      body: { pgn: '1. e4 *', accept_permanent: true },
    })

    await store.importFromAccount('chesscom', '  Hikaru ', 75)
    expect(calls[1]).toMatchObject({
      url: '/api/import/account',
      body: { platform: 'chesscom', username: 'Hikaru', max: 75, accept_permanent: true },
    })
  })

  it('saves a finished analysis to the server', async () => {
    const store = useGameStore()
    await store.fetchGame('abc')
    await store.startAnalysis(evaluator())

    const put = calls.find((call) => call.method === 'PUT')!
    expect(put.url).toBe(`/api/games/${game!.id}/analysis`)
    expect((put.body as { evals: unknown[] }).evals).toHaveLength(5)
    expect(store.isAnalyzing).toBe(false)
    expect(store.currentGame!.analysis!.evals).toHaveLength(5)
    expect(store.analysisReport!.moves).toHaveLength(4)
  })

  it('reports an analysis the server refused', async () => {
    stubApi((call) => (call.method === 'PUT' ? null : game))
    const store = useGameStore()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit = {}) =>
        init.method === 'PUT'
          ? new Response(JSON.stringify({ error: 'This analysis is not valid.' }), {
              status: 400,
            })
          : new Response(JSON.stringify(game), { status: 200 }),
      ),
    )

    await store.fetchGame('abc')
    await store.startAnalysis(evaluator())

    expect(store.analysisError).toBe('This analysis is not valid.')
    expect(store.isAnalyzing).toBe(false)
  })

  it('hides a finished analysis without deleting it', async () => {
    const store = useGameStore()
    await store.fetchGame('abc')
    await store.startAnalysis(evaluator())
    expect(store.currentEval).not.toBeNull()

    store.analysisHidden = true
    expect(store.currentEval).toBeNull()
    expect(store.analysisReport).toBeNull()
    expect(store.currentGame!.analysis!.evals).toHaveLength(5)

    store.analysisHidden = false
    expect(store.currentEval).not.toBeNull()
  })

  it('discards partial results when an analysis is cancelled', async () => {
    const store = useGameStore()
    await store.fetchGame('abc')

    let stop: (reason: Error) => void = () => {}
    const run = store.startAnalysis(() => ({
      evaluate: () => new Promise((_, reject) => (stop = reject)),
      terminate: () => stop(new EngineStoppedError()),
    }))
    expect(store.isAnalyzing).toBe(true)

    store.cancelAnalysis()
    await run

    expect(store.isAnalyzing).toBe(false)
    expect(store.analysisError).toBeNull()
    expect(store.currentGame!.analysis).toBeUndefined()
    expect(calls.some((call) => call.method === 'PUT')).toBe(false)
  })

  it('fails to load a game that does not exist', async () => {
    const store = useGameStore()
    stubApi()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify({ error: 'Game not found.' }), { status: 404 }),
      ),
    )

    await expect(store.fetchGame('missing')).rejects.toThrow('Game not found.')
    expect(store.currentGame).toBeNull()
  })

  it('steps through every position of a game', async () => {
    const store = useGameStore()
    await store.fetchGame('abc')

    const seen = [store.currentFen]
    while (!store.isAtEnd) {
      store.nextMove()
      seen.push(store.currentFen)
    }

    expect(new Set(seen).size).toBe(5)
    expect(store.currentFen).toBe(store.currentGame!.final_fen)
  })
})

describe('variations', () => {
  beforeEach(() => {
    stubApi((call) => (call.method === 'PUT' ? call.body : game))
    setActivePinia(createPinia())
  })

  it("follows the game when the game's own move is played", async () => {
    const store = useGameStore()
    await store.fetchGame('abc')

    store.playBoardMove('e2', 'e4')
    expect(store.currentMoveIndex).toBe(1)
    expect(store.variations).toHaveLength(0)
  })

  it('records side lines without losing any', async () => {
    const store = useGameStore()
    await store.fetchGame('abc')
    store.goToMove(1) // After 1. e4

    store.playBoardMove('e7', 'e5')
    store.playBoardMove('g1', 'f3')
    expect(store.variations).toHaveLength(1)
    expect(store.variations[0]!.moves.map((move) => move.san)).toEqual(['e5', 'Nf3'])
    expect(store.variations[0]!.moves[0]).toMatchObject({ moveNumber: 1, color: 'black' })
    expect(store.isAtEnd).toBe(true)

    // A different move in the middle starts a second line instead of overwriting the first
    store.prevMove()
    store.playBoardMove('b1', 'c3')
    expect(store.variations.map((v) => v.moves.map((move) => move.san))).toEqual([
      ['e5', 'Nf3'],
      ['e5', 'Nc3'],
    ])

    // Replaying a known move enters the existing line
    store.goToMove(1)
    store.playBoardMove('e7', 'e5')
    expect(store.activeVariation).toEqual({ id: store.variations[0]!.id, ply: 1 })

    // Stepping back from the first move returns to the game
    store.prevMove()
    expect(store.activeVariation).toBeNull()
    expect(store.currentMoveIndex).toBe(1)

    store.removeVariation(store.variations[0]!.id)
    expect(store.variations).toHaveLength(1)
  })

  it('ignores illegal moves', async () => {
    const store = useGameStore()
    await store.fetchGame('abc')

    store.playBoardMove('e2', 'e5')
    expect(store.currentMoveIndex).toBe(0)
    expect(store.variations).toHaveLength(0)
  })

  it('evaluates and grades variations once the game is analyzed', async () => {
    const store = useGameStore()
    await store.fetchGame('abc')
    await store.startAnalysis(evaluator(12))
    store.setExplorationEngine(evaluator(500))

    store.goToMove(1)
    store.playBoardMove('f7', 'f6') // A bad reply, judging by the evaluator's +5.00
    expect(store.isEvaluatingVariation).toBe(true)
    await flushPromises()

    expect(store.isEvaluatingVariation).toBe(false)
    expect(store.currentEval).toMatchObject({ cp: 500 })
    expect(store.variationGrades.get(store.variations[0]!.id)).toEqual(['blunder'])
    expect(store.currentMoveGrade).toMatchObject({ grade: 'blunder', move: 'f6' })
    expect(store.currentCoachComment).toMatchObject({
      tone: 'blunder',
      headline: 'f6 is a blunder.',
    })
  })

  it('does not evaluate variations when the analysis is off', async () => {
    const store = useGameStore()
    await store.fetchGame('abc')
    const create = vi.fn<() => PositionEvaluator>(evaluator())
    store.setExplorationEngine(create)

    store.goToMove(1)
    store.playBoardMove('e7', 'e5')
    await flushPromises()

    expect(store.currentEval).toBeNull()
    expect(create).not.toHaveBeenCalled()
  })
})
