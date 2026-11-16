/** Downloads games from the public Lichess API. Lichess asks for one request at a time. */
import { config } from './config.ts'
import { createRemoteSource } from './remoteSource.ts'

const STANDARD_PERF_TYPES = 'ultraBullet,bullet,blitz,rapid,classical,correspondence'

const lichess = createRemoteSource(config.lichessUrl)

/** Downloads a player's most recent finished standard-chess games as PGN. */
export function fetchRecentGames(username: string, max: number): Promise<string> {
  return lichess.enqueue(async () => {
    const params = new URLSearchParams({
      max: String(max),
      perfType: STANDARD_PERF_TYPES,
      opening: 'true',
      clocks: 'false',
      evals: 'false',
      finished: 'true',
      ongoing: 'false',
    })
    const response = await lichess.fetch(
      `/api/games/user/${encodeURIComponent(username)}?${params}`,
      'application/x-chess-pgn',
    )
    if (!response.ok) throw new Error(`Lichess export error ${response.status}`)
    return response.text()
  })
}
