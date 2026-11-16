/**
 * Downloads games from the public Chess.com API (https://www.chess.com/news/view/published-data-api).
 * Games are published in monthly archives, so the newest months are read until enough games
 * are found. Chess.com allows unlimited requests as long as they are made one at a time.
 */
import { config } from './config.ts'
import { createRemoteSource } from './remoteSource.ts'

// Stops a player with years of variant-only months from causing endless requests
const MAX_MONTHS_SCANNED = 120

const chesscom = createRemoteSource(config.chesscomUrl)

interface ArchiveGame {
  pgn?: string
  rules?: string
}

async function getJson<T>(path: string): Promise<T> {
  const response = await chesscom.fetch(path, 'application/json')
  if (!response.ok) throw new Error(`Chess.com error ${response.status}`)
  return (await response.json()) as T
}

/** Downloads a player's most recent standard-chess games as PGN, oldest first. */
export function fetchRecentGames(username: string, max: number): Promise<string> {
  return chesscom.enqueue(async () => {
    const player = encodeURIComponent(username.toLowerCase())
    const { archives } = await getJson<{ archives?: string[] }>(
      `/pub/player/${player}/games/archives`,
    )

    // The archive URLs come from Chess.com; only their year and month are used, so a
    // response can't send the server anywhere else
    const months = (archives ?? [])
      .map((url) => url.match(/\/(\d{4})\/(\d{2})$/))
      .filter((match): match is RegExpMatchArray => match !== null)
      .map(([, year, month]) => `${year}/${month}`)
      .reverse()
      .slice(0, MAX_MONTHS_SCANNED)

    const newestFirst: string[] = []
    for (const month of months) {
      const { games } = await getJson<{ games?: ArchiveGame[] }>(
        `/pub/player/${player}/games/${month}`,
      )
      for (const game of (games ?? []).reverse()) {
        if (game.rules === 'chess' && game.pgn) newestFirst.push(game.pgn)
        if (newestFirst.length >= max) break
      }
      if (newestFirst.length >= max) break
    }

    return newestFirst.reverse().join('\n\n')
  })
}
