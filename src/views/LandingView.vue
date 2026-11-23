<script setup lang="ts">
import { onMounted, ref } from 'vue'
import ChessBoard from '@/components/game-detail/ChessBoard.vue'
import { api } from '@/services/api'
import type { GameSummary } from '@/services/pgnParser'
import { getEcoOpeningName } from '@/data/ecoOpenings'

// Morphy's Opera Game, Paris 1858, one move before the end: Rd8 is mate
const OPERA_FEN = '1n2kb1r/p4ppp/4q3/4p1B1/4P3/8/PPP2PPP/2KR4 w k - 0 17'

const STEPS = [
  {
    name: 'Import',
    text: 'Paste a PGN, drop a file, or type a Lichess or Chess.com username to bring in up to 500 games at once. Games already on the site are recognized and skipped.',
  },
  {
    name: 'Analyze',
    text: 'Stockfish checks every position, right in your browser. You get the evaluation, a graph of the winning chances, each side’s accuracy and an estimate of the rating they played at.',
  },
  {
    name: 'Understand',
    text: 'A coach goes through the game with you. For each mistake it shows what was left hanging, which fork or mate it allowed, and what the stronger move was.',
  },
  {
    name: 'Share',
    text: 'Every game gets a permanent link, analysis included, so whoever opens it next sees the same board and the same notes without waiting.',
  },
]

const recent = ref<GameSummary[]>([])
const total = ref<number | null>(null)

onMounted(async () => {
  try {
    const page = await api<{ games: GameSummary[]; total: number }>('/api/games')
    recent.value = page.games.slice(0, 5)
    total.value = page.total
  } catch {
    // The page reads fine without the list
  }
})

const opening = (game: GameSummary) =>
  getEcoOpeningName(game.eco_code) ?? game.opening_name ?? game.eco_code ?? ''
</script>

<template>
  <div class="bg-ink">
    <!-- Opening: what Delta is, and a real position to look at -->
    <section class="mx-auto max-w-7xl px-4 pt-12 pb-16 sm:px-6 lg:pt-20 lg:pb-24">
      <div class="grid items-center gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16">
        <div>
          <p class="text-[11px] uppercase tracking-[0.25em] text-gray-500">
            Chess game analysis <span class="text-accent">·</span> free and open source
          </p>
          <h1 class="mt-6 text-5xl leading-[1.02] text-gray-100 sm:text-6xl lg:text-7xl">
            See where the game <em class="text-accent">turned</em>.
          </h1>
          <p
            class="mt-8 max-w-xl font-serif text-xl leading-relaxed text-gray-300 sm:text-[1.35rem]"
          >
            Delta is a public archive of chess games. Bring yours in from Lichess, Chess.com or a
            PGN file, replay them move by move, and let Stockfish and a plain-spoken coach show you
            the moments that decided them.
          </p>

          <div class="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
            <router-link
              to="/import"
              class="bg-accent px-6 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-white transition-colors hover:bg-accent-dark"
            >
              Import a game
            </router-link>
            <router-link
              to="/explore"
              class="group text-xs uppercase tracking-[0.2em] text-gray-300 transition-colors hover:text-gray-100"
            >
              Explore
              <template v-if="total">{{ total.toLocaleString('en-US') }}</template> games
              <span class="inline-block transition-transform group-hover:translate-x-1">→</span>
            </router-link>
          </div>

          <dl class="mt-14 grid max-w-xl grid-cols-3 border-t border-gray-800 pt-6 text-xs">
            <div>
              <dt class="text-gray-500">Account</dt>
              <dd class="mt-1 text-gray-200">None needed</dd>
            </div>
            <div>
              <dt class="text-gray-500">Engine</dt>
              <dd class="mt-1 text-gray-200">Stockfish 19</dd>
            </div>
            <div>
              <dt class="text-gray-500">Cookies</dt>
              <dd class="mt-1 text-gray-200">Zero</dd>
            </div>
          </dl>
        </div>

        <figure class="mx-auto w-full max-w-md lg:max-w-none">
          <div class="pointer-events-none select-none">
            <ChessBoard :fen="OPERA_FEN" :last-move="['d7', 'b8']" arrow="d1d8" />
          </div>
          <figcaption class="mt-4 border-l border-accent pl-4">
            <p class="font-serif text-lg text-gray-200">
              17. Rd8<span class="text-accent">#</span>
            </p>
            <p class="mt-1 text-sm leading-relaxed text-gray-400">
              White gave up the queen on b8 so the rook could deliver mate. The arrow is the
              engine’s move, the red squares the last one played.
            </p>
            <p class="mt-2 text-[11px] uppercase tracking-[0.2em] text-gray-600">
              Morphy vs. the Duke of Brunswick and Count Isouard · Paris, 1858
            </p>
          </figcaption>
        </figure>
      </div>
    </section>

    <!-- The name -->
    <section class="border-y border-gray-800 bg-surface">
      <div
        class="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:py-20"
      >
        <p class="font-serif text-8xl leading-none text-accent select-none" aria-hidden="true">Δ</p>
        <div class="max-w-2xl">
          <h2 class="font-serif text-3xl text-gray-100 sm:text-4xl">Why “Delta”</h2>
          <p class="mt-5 text-sm leading-7 text-gray-400">
            In mathematics, Δ stands for a change. In chess, every move changes the evaluation of
            the position: most barely move it, a few swing it for good. Delta measures that change
            for each move of the game, so instead of rereading forty moves you can go straight to
            the three that mattered.
          </p>
        </div>
      </div>
    </section>

    <!-- How it works, written like a move list -->
    <section class="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
      <h2 class="font-serif text-3xl text-gray-100 sm:text-4xl">How it works</h2>
      <ol class="mt-10 border-t border-gray-800">
        <li
          v-for="(step, index) in STEPS"
          :key="step.name"
          class="grid gap-2 border-b border-gray-800 py-6 sm:grid-cols-[4rem_12rem_minmax(0,1fr)] sm:gap-6"
        >
          <span class="text-sm text-accent">{{ index + 1 }}.</span>
          <h3 class="text-sm uppercase tracking-[0.2em] text-gray-100">{{ step.name }}</h3>
          <p class="max-w-2xl text-sm leading-7 text-gray-400">{{ step.text }}</p>
        </li>
      </ol>
    </section>

    <!-- Real games from the archive -->
    <section v-if="recent.length" class="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:pb-24">
      <div class="flex items-baseline justify-between gap-4">
        <h2 class="font-serif text-3xl text-gray-100 sm:text-4xl">Recently added</h2>
        <router-link
          to="/explore"
          class="text-xs uppercase tracking-[0.2em] text-gray-400 transition-colors hover:text-gray-100"
          >All games →</router-link
        >
      </div>
      <ul class="mt-8 border-t border-gray-800">
        <li v-for="game in recent" :key="game.id">
          <router-link
            :to="{ name: 'game-detail', params: { id: game.id } }"
            class="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-1 border-b border-gray-800 py-4 transition-colors hover:bg-surface sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_5rem] sm:px-2"
          >
            <span class="truncate text-sm text-gray-200 group-hover:text-gray-100">
              {{ game.white_player }} <span class="text-gray-600">–</span> {{ game.black_player }}
            </span>
            <span
              class="order-last col-span-2 truncate text-xs text-gray-500 sm:order-none sm:col-span-1"
            >
              {{ opening(game) }}
            </span>
            <span class="text-right text-sm text-gray-400 tabular-nums">{{ game.result }}</span>
          </router-link>
        </li>
      </ul>
    </section>

    <!-- Closing -->
    <section class="border-t border-gray-800">
      <div
        class="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-16 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:py-20"
      >
        <p class="max-w-2xl font-serif text-3xl leading-snug text-gray-100 sm:text-4xl">
          No account, no ads, no tracking.<br />
          <span class="text-gray-500">Just your games and an honest engine.</span>
        </p>
        <router-link
          to="/import"
          class="self-start bg-accent px-6 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-white transition-colors hover:bg-accent-dark lg:self-auto"
        >
          Import your first game
        </router-link>
      </div>
    </section>
  </div>
</template>
