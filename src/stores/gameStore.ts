import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { api } from '../services/api'
import { computePositions } from '../services/pgnParser'
import type { BoardPosition, GameSummary, ParsedGame } from '../services/pgnParser'
import { EngineStoppedError, StockfishEngine, type PositionEvaluator } from '../services/engine'
import {
  ANALYSIS_LIMITS,
  ENGINE_NAME,
  buildReport,
  evaluatePositions,
  isAnalyzable,
  uciToSan,
  type GameAnalysis,
  type MoveGrade,
  type PositionEval,
} from '../services/gameAnalysis'
import { reportGame, sideToMove } from '../services/moveScoring'
import { legalDests, playMove, type Variation } from '../services/variations'
import { getEcoOpeningName } from '../data/ecoOpenings'

export type ImportPlatform = 'lichess' | 'chesscom'

/** "As many as possible" on the import page. The server allows the same sizes. */
export const MAX_ACCOUNT_IMPORT = 500
export const ACCOUNT_IMPORT_SIZES = [MAX_ACCOUNT_IMPORT, 100, 75, 50, 25, 10, 5, 3, 1]

const TERMINATION_LABELS: Record<string, string> = {
  mate: 'checkmate',
  resign: 'resignation',
  time: 'timeout',
}

export interface GameFilters {
  game_name: string
  player_name: string
  game_types: string[]
  results: string[]
  terminations: string[]
  eco_code: string
  // A cleared number input reports an empty string
  min_elo: number | '' | null
  max_elo: number | '' | null
  time_control_kind: '' | 'standard' | 'increment'
  played_date: string
  imported_date: string
  analyzed_only: boolean
}

export interface ImportResult {
  games: { id: string; isNew: boolean }[]
  created: number
  duplicates: number
}

interface GameListResponse {
  games: GameSummary[]
  total: number
  page: number
  pageSize: number
}

export function createEmptyFilters(): GameFilters {
  return {
    game_name: '',
    player_name: '',
    game_types: [],
    results: [],
    terminations: [],
    eco_code: '',
    min_elo: null,
    max_elo: null,
    time_control_kind: '',
    played_date: '',
    imported_date: '',
    analyzed_only: false,
  }
}

function filtersToQuery(filters: GameFilters, page: number): string {
  const query = new URLSearchParams({ page: String(page) })
  for (const [key, value] of Object.entries(filters)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== '' && item !== null && item !== false) query.append(key, String(item))
    }
  }
  return query.toString()
}

export const useGameStore = defineStore('game', () => {
  // ==========================================
  // 1. STATE
  // ==========================================
  const filters = ref<GameFilters>(createEmptyFilters())

  const games = ref<GameSummary[]>([])
  const totalGames = ref(0)
  const page = ref(1)
  const pageSize = ref(25)
  const listLoading = ref(false)
  const listError = ref<string | null>(null)
  let latestListRequest = 0

  const currentGame = ref<ParsedGame | null>(null)
  const currentPositions = ref<BoardPosition[]>([])
  const currentMoveIndex = ref(0)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const isAnalyzing = ref(false)
  const analysisError = ref<string | null>(null)
  const analysisHidden = ref(false) // Hides the eval bar, arrow, move marks and stats
  const liveEvals = ref<PositionEval[]>([]) // Results so far while an analysis is running
  let activeEngine: PositionEvaluator | null = null

  // Side lines played on the board. They stay in this browser and are never saved.
  const variations = ref<Variation[]>([])
  const activeVariation = ref<{ id: number; ply: number } | null>(null) // ply 1 is its first move
  let nextVariationId = 1

  // Evaluations of variation positions, by FEN. Run one at a time on a second engine.
  const explorationEvals = ref(new Map<string, PositionEval>())
  const explorationQueue: string[] = []
  let explorationRunning = false
  let explorer: PositionEvaluator | null = null
  let createExplorer: () => PositionEvaluator = () => new StockfishEngine()

  // ==========================================
  // 2. GETTERS
  // ==========================================
  const totalPages = computed(() => Math.max(1, Math.ceil(totalGames.value / pageSize.value)))

  const currentVariation = computed(
    () => variations.value.find((variation) => variation.id === activeVariation.value?.id) ?? null,
  )

  const currentPosition = computed<BoardPosition | null>(() => {
    if (currentVariation.value && activeVariation.value) {
      return currentVariation.value.moves[activeVariation.value.ply - 1] ?? null
    }
    return currentPositions.value[currentMoveIndex.value] ?? null
  })

  const currentFen = computed(() => currentPosition.value?.fen ?? null)

  const canAnalyze = computed(() => {
    const game = currentGame.value
    return !!game && game.moves_count > 0 && isAnalyzable(game.pgn)
  })

  /** Variations can be played in any standard-chess game; variants have other rules. */
  const currentDests = computed(() =>
    currentGame.value && isAnalyzable(currentGame.value.pgn) && currentFen.value
      ? legalDests(currentFen.value)
      : new Map(),
  )

  const currentEvals = computed(() => currentGame.value?.analysis?.evals ?? liveEvals.value)

  /** Variations are evaluated automatically once the game has a visible analysis. */
  const variationEvalsEnabled = computed(
    () => !!currentGame.value?.analysis && !analysisHidden.value,
  )

  const currentEval = computed(() => {
    if (analysisHidden.value) return null
    if (currentVariation.value) {
      if (!variationEvalsEnabled.value || !currentFen.value) return null
      return explorationEvals.value.get(currentFen.value) ?? null
    }
    return currentEvals.value[currentMoveIndex.value] ?? null
  })

  /** True while the engine is still working on the variation position being shown. */
  const isEvaluatingVariation = computed(
    () => !!currentVariation.value && variationEvalsEnabled.value && !currentEval.value,
  )

  const analysisReport = computed(() => {
    if (analysisHidden.value || !currentGame.value || currentEvals.value.length === 0) return null
    return buildReport(currentGame.value.moves, currentPositions.value, currentEvals.value)
  })

  /** Each variation move's grade, for the moves whose before and after positions are known. */
  const variationGrades = computed(() => {
    const grades = new Map<number, (MoveGrade | null)[]>()
    if (!variationEvalsEnabled.value) return grades

    for (const variation of variations.value) {
      const evals: PositionEval[] = []
      const first = currentEvals.value[variation.startIndex]
      if (first) {
        evals.push(first)
        for (const move of variation.moves) {
          const evaluation = explorationEvals.value.get(move.fen)
          if (!evaluation) break
          evals.push(evaluation)
        }
      }
      const startFen = currentPositions.value[variation.startIndex]!.fen
      const sans = variation.moves.map((move) => move.san)
      grades.set(
        variation.id,
        reportGame(sans, sideToMove(startFen), evals).moves.map((move) => move.grade),
      )
    }
    return grades
  })

  /** The grade of the move that led to the position on the board, in the game or a variation. */
  const currentMoveGrade = computed(() => {
    if (analysisHidden.value || !currentGame.value) return null

    const variation = currentVariation.value
    if (variation && activeVariation.value) {
      const ply = activeVariation.value.ply
      const grade = variationGrades.value.get(variation.id)?.[ply - 1]
      if (!grade) return null
      const before =
        ply === 1
          ? currentEvals.value[variation.startIndex]
          : explorationEvals.value.get(variation.moves[ply - 2]!.fen)
      return { grade, move: variation.moves[ply - 1]!.san, best: before?.bestSan ?? null }
    }

    const index = currentMoveIndex.value - 1
    const grade = analysisReport.value?.moves[index]?.grade
    if (!grade) return null
    return {
      grade,
      move: currentGame.value.moves[index]!,
      best: currentEvals.value[index]?.bestSan ?? null,
    }
  })

  const gameMetadata = computed(() => {
    if (!currentGame.value) return null
    return {
      white: currentGame.value.white_player,
      black: currentGame.value.black_player,
      whiteElo: currentGame.value.white_elo,
      blackElo: currentGame.value.black_elo,
      result: currentGame.value.result,
      winner: currentGame.value.winner,
      date: currentGame.value.played_date,
      opening: currentGame.value.opening_name ?? getEcoOpeningName(currentGame.value.eco_code),
      ecoCode: currentGame.value.eco_code,
      timeControl: currentGame.value.time_control,
      gameType: currentGame.value.game_type,
      termination: TERMINATION_LABELS[currentGame.value.termination_type ?? ''] ?? null,
      source: currentGame.value.source,
      link: currentGame.value.link,
    }
  })

  const isAtStart = computed(() => !activeVariation.value && currentMoveIndex.value === 0)
  const isAtEnd = computed(() => {
    if (!currentGame.value) return true
    if (currentVariation.value && activeVariation.value) {
      return activeVariation.value.ply >= currentVariation.value.moves.length
    }
    return currentMoveIndex.value >= currentGame.value.moves_count
  })

  // ==========================================
  // 3. ACTIONS
  // ==========================================
  async function fetchGames(): Promise<void> {
    const request = ++latestListRequest
    listLoading.value = true
    listError.value = null

    try {
      const result = await api<GameListResponse>(
        `/api/games?${filtersToQuery(filters.value, page.value)}`,
      )
      if (request !== latestListRequest) return // A newer search has replaced this one
      games.value = result.games
      totalGames.value = result.total
      pageSize.value = result.pageSize
    } catch (err) {
      if (request === latestListRequest) {
        listError.value = err instanceof Error ? err.message : 'Could not load games.'
      }
    } finally {
      if (request === latestListRequest) listLoading.value = false
    }
  }

  function updateFilters(newFilters: GameFilters): Promise<void> {
    filters.value = { ...newFilters }
    page.value = 1
    return fetchGames()
  }

  function goToPage(newPage: number): Promise<void> {
    page.value = Math.min(totalPages.value, Math.max(1, newPage))
    return fetchGames()
  }

  function importPgn(pgn: string): Promise<ImportResult> {
    return api<ImportResult>('/api/games', {
      method: 'POST',
      body: { pgn, accept_permanent: true },
    })
  }

  function importFromAccount(
    platform: ImportPlatform,
    username: string,
    max: number,
  ): Promise<ImportResult> {
    return api<ImportResult>('/api/import/account', {
      method: 'POST',
      body: { platform, username: username.trim(), max, accept_permanent: true },
    })
  }

  // ---- Variations ----

  /** Plays a move dragged on the board, following the game or a known line when it can. */
  function playBoardMove(orig: string, dest: string): void {
    const fen = currentFen.value
    if (!fen || !currentGame.value || !isAnalyzable(currentGame.value.pgn)) return
    const move = playMove(fen, orig, dest)
    if (!move) return

    const variation = currentVariation.value
    const ply = activeVariation.value?.ply ?? 0
    const startIndex = variation?.startIndex ?? currentMoveIndex.value

    // The game's own next move just steps forward
    if (!variation && currentPositions.value[startIndex + 1]?.fen === move.fen) {
      currentMoveIndex.value = startIndex + 1
      return
    }

    const line = [...(variation?.moves.slice(0, ply) ?? []), move]
    const known = variations.value.find(
      (other) =>
        other.startIndex === startIndex &&
        line.every((lineMove, index) => other.moves[index]?.fen === lineMove.fen),
    )
    if (known) {
      activeVariation.value = { id: known.id, ply: line.length }
      return
    }

    // At the end of a variation the move extends it; elsewhere it starts a new one, so no
    // line is ever lost
    if (variation && ply === variation.moves.length) {
      variation.moves.push(move)
      activeVariation.value = { id: variation.id, ply: line.length }
      return
    }

    const created: Variation = { id: nextVariationId++, startIndex, moves: line }
    variations.value.push(created)
    currentMoveIndex.value = startIndex
    activeVariation.value = { id: created.id, ply: line.length }
  }

  function goToVariationMove(id: number, ply: number): void {
    const variation = variations.value.find((candidate) => candidate.id === id)
    if (!variation || ply < 1 || ply > variation.moves.length) return
    currentMoveIndex.value = variation.startIndex
    activeVariation.value = { id, ply }
  }

  function removeVariation(id: number): void {
    if (activeVariation.value?.id === id) activeVariation.value = null
    variations.value = variations.value.filter((variation) => variation.id !== id)
  }

  /** Lets tests replace Stockfish. */
  function setExplorationEngine(factory: () => PositionEvaluator): void {
    stopExploration()
    createExplorer = factory
  }

  function stopExploration(): void {
    explorationQueue.length = 0
    explorer?.terminate()
    explorer = null
  }

  function clearVariations(): void {
    stopExploration()
    variations.value = []
    activeVariation.value = null
    explorationEvals.value = new Map()
  }

  /** Queues a position. Urgent ones, like the position on the board, go first. */
  function requestExplorationEval(fen: string, urgent: boolean): void {
    if (explorationEvals.value.has(fen)) return
    const queued = explorationQueue.indexOf(fen)
    if (queued !== -1) {
      if (!urgent) return
      explorationQueue.splice(queued, 1)
    }
    if (urgent) explorationQueue.unshift(fen)
    else explorationQueue.push(fen)
    void runExplorationQueue()
  }

  async function runExplorationQueue(): Promise<void> {
    if (explorationRunning) return
    explorationRunning = true
    try {
      while (explorationQueue.length > 0 && variationEvalsEnabled.value) {
        const fen = explorationQueue.shift()!
        if (explorationEvals.value.has(fen)) continue
        explorer ??= createExplorer()
        const evaluation = await explorer.evaluate(fen, ANALYSIS_LIMITS)
        explorationEvals.value.set(fen, { ...evaluation, bestSan: uciToSan(fen, evaluation.best) })
      }
    } catch (err) {
      if (!(err instanceof EngineStoppedError)) {
        analysisError.value = err instanceof Error ? err.message : 'The engine stopped.'
      }
    } finally {
      explorationRunning = false
    }
  }

  // Evaluates the variation on the board, starting with the position being shown
  watch([currentFen, variationEvalsEnabled, () => currentVariation.value?.moves.length], () => {
    const variation = currentVariation.value
    if (!variation || !variationEvalsEnabled.value || !currentFen.value) return
    requestExplorationEval(currentFen.value, true)
    for (const move of variation.moves) requestExplorationEval(move.fen, false)
  })

  function cancelAnalysis(): void {
    activeEngine?.terminate()
    activeEngine = null
    isAnalyzing.value = false
    liveEvals.value = []
  }

  async function startAnalysis(
    createEvaluator: () => PositionEvaluator = () => new StockfishEngine(),
  ): Promise<void> {
    const game = currentGame.value
    if (!game || isAnalyzing.value || !canAnalyze.value) return

    const engine = createEvaluator()
    activeEngine = engine
    isAnalyzing.value = true
    analysisHidden.value = false
    analysisError.value = null
    liveEvals.value = []

    try {
      await evaluatePositions(currentPositions.value, engine, (evaluation) => {
        liveEvals.value.push(evaluation)
      })

      // The server keeps the first analysis of each game and returns whichever it has
      game.analysis = await api<GameAnalysis>(`/api/games/${game.id}/analysis`, {
        method: 'PUT',
        body: { engine: ENGINE_NAME, depth: ANALYSIS_LIMITS.depth, evals: liveEvals.value },
      })
    } catch (err) {
      if (!(err instanceof EngineStoppedError)) {
        analysisError.value = err instanceof Error ? err.message : 'The analysis failed.'
      }
    } finally {
      // A newer run may have replaced this one after it was cancelled
      if (activeEngine === engine) {
        engine.terminate()
        activeEngine = null
        isAnalyzing.value = false
        liveEvals.value = []
      }
    }
  }

  async function fetchGame(id: string): Promise<void> {
    cancelAnalysis()
    clearVariations()
    analysisError.value = null
    loading.value = true
    error.value = null

    try {
      const game = await api<ParsedGame>(`/api/games/${encodeURIComponent(id)}`)
      currentPositions.value = computePositions(game.pgn)
      currentGame.value = game
      currentMoveIndex.value = 0
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load game'
      currentGame.value = null
      currentPositions.value = []
      throw err
    } finally {
      loading.value = false
    }
  }

  function nextMove(): void {
    if (!currentGame.value) return
    if (currentVariation.value && activeVariation.value) {
      if (activeVariation.value.ply < currentVariation.value.moves.length) {
        activeVariation.value.ply++
      }
      return
    }
    if (currentMoveIndex.value < currentGame.value.moves_count) {
      currentMoveIndex.value++
    }
  }

  /************ Move Engine Traversal controllers ************/
  function prevMove(): void {
    if (activeVariation.value) {
      // Stepping back from a variation's first move returns to the game where it branched
      if (activeVariation.value.ply > 1) activeVariation.value.ply--
      else activeVariation.value = null
      return
    }
    if (currentMoveIndex.value > 0) {
      currentMoveIndex.value--
    }
  }

  function goToMove(index: number): void {
    if (!currentGame.value) return
    if (index >= 0 && index <= currentGame.value.moves_count) {
      activeVariation.value = null
      currentMoveIndex.value = index
    }
  }

  function goToStart(): void {
    activeVariation.value = null
    currentMoveIndex.value = 0
  }

  function goToEnd(): void {
    if (!currentGame.value) return
    activeVariation.value = null
    currentMoveIndex.value = currentGame.value.moves_count
  }

  function reset(): void {
    cancelAnalysis()
    clearVariations()
    currentGame.value = null
    currentPositions.value = []
    currentMoveIndex.value = 0
    error.value = null
  }

  return {
    // Shared States
    filters,
    games,
    totalGames,
    page,
    pageSize,
    listLoading,
    listError,
    currentGame,
    currentMoveIndex,
    loading,
    error,
    isAnalyzing,
    analysisError,
    analysisHidden,
    variations,
    activeVariation,

    // Core Engine Getters
    totalPages,
    currentPosition,
    currentFen,
    currentDests,
    currentVariation,
    gameMetadata,
    isAtStart,
    isAtEnd,
    canAnalyze,
    currentEvals,
    currentEval,
    analysisReport,
    variationEvalsEnabled,
    isEvaluatingVariation,
    variationGrades,
    currentMoveGrade,

    // Core Engine Actions
    fetchGames,
    updateFilters,
    goToPage,
    importPgn,
    importFromAccount,
    playBoardMove,
    goToVariationMove,
    removeVariation,
    setExplorationEngine,
    stopExploration,
    startAnalysis,
    cancelAnalysis,
    fetchGame,
    nextMove,
    prevMove,
    goToMove,
    goToStart,
    goToEnd,
    reset,
  }
})
