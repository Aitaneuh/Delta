/** Shared plumbing for the chess sites that games are imported from. */

const USER_AGENT = 'DeltaAnalyzer'
const RATE_LIMIT_PAUSE_MS = 60_000
const REQUEST_TIMEOUT_MS = 120_000

/** The site asked us to slow down, so requests are paused for a minute. */
export class SourceBusyError extends Error {}

/** The site has no player with that username. */
export class PlayerNotFoundError extends Error {}

export interface RemoteSource {
  /** Runs tasks one after another, across every visitor, as both sites ask. */
  enqueue<T>(task: () => Promise<T>): Promise<T>
  fetch(path: string, accept: string): Promise<Response>
}

export function createRemoteSource(baseUrl: string): RemoteSource {
  let queue: Promise<unknown> = Promise.resolve()
  let pausedUntil = 0

  return {
    enqueue(task) {
      const result = queue.then(() => {
        if (Date.now() < pausedUntil) throw new SourceBusyError()
        return task()
      })
      queue = result.catch(() => {})
      return result
    },

    async fetch(path, accept) {
      const response = await fetch(baseUrl + path, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { 'User-Agent': USER_AGENT, Accept: accept },
      })
      if (response.status === 429) {
        pausedUntil = Date.now() + RATE_LIMIT_PAUSE_MS
        throw new SourceBusyError()
      }
      if (response.status === 404 || response.status === 410) throw new PlayerNotFoundError()
      return response
    },
  }
}
