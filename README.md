# Delta

Like [ballchasing.com](https://ballchasing.com), but for chess. Upload your games, replay them move by move and analyze them with Stockfish.

## Features

- **No account needed**
- **Import games** from any Lichess or Chess.com player by username (from the last game up to 500), or from PGN text and files, with duplicates detected automatically
- **Replay** on an interactive board, using the arrow keys: ← → to step through moves, ↑ ↓ to jump to the first or last move
- **Computer analysis** with Stockfish running in the browser: eval bar, winning-chances graph, best-move arrow, marked inaccuracies, mistakes and blunders, and accuracy per player
- **Estimated Elo:** a rough guess at the rating each player performed at, from their average centipawn loss
- **Coach:** explains each move in plain words: what a bad move allows (a hanging piece, a fork, a forced mate), what the player missed, and how the evaluation changed. It runs in the browser from the Stockfish results, with no outside service
- **Explore variations** by moving the pieces: side lines appear in the move list and, once a game is analyzed, are evaluated and graded automatically
- **Explore** every uploaded game, filtered by player, event, game type, result, termination, ECO code, Elo, time control and date
- **Opening names** for all 500 ECO codes
- **Permanent, shareable games:** every uploaded game is public and can't be deleted by users

## Tech stack

| Part | Tools |
|---|---|
| Frontend | Vue 3, TypeScript, Pinia, Vue Router, Tailwind CSS |
| Chess | chessground, chessops, Stockfish (WebAssembly) |
| Backend | Node.js, Fastify |
| Database | PostgreSQL |
| Hosting | Docker Compose |

## Running it locally

### Everything in Docker

You only need Docker.

```sh
npm run dev:docker        # Database, API and website on http://localhost:5173, with live reload
npm run dev:docker:down   # Stops it
```

Without npm, run `docker compose -f docker-compose.dev.yml --profile app up --build --renew-anon-volumes`.

### With Node on your computer

You need Node.js 24 and Docker.

```sh
npm install
cp .env.example .env
npm run dev:db       # Starts PostgreSQL in Docker
npm run dev:server   # API on port 3000
npm run dev          # Website on http://localhost:5173
```

The database tables are created automatically when the server starts.

## Useful commands

| Command | What it does |
|---|---|
| `npm run test:unit` | Runs the unit tests |
| `npm run type-check` | Checks the TypeScript types |
| `npm run lint` | Lints the code and applies automatic fixes |
| `npm run format` | Formats `src/` |
| `npm run build` | Type-checks and builds the website |

## Hosting

The site ships as a two-container Docker stack, ready to deploy from Portainer. See [DEPLOYMENT.md](DEPLOYMENT.md) for the setup, the checklist to complete before going public, moderation and backups.

## License

[GNU General Public License v3.0 or later](LICENSE). Delta Analyzer includes Stockfish, chessground and chessops, which are also GPL-licensed.
