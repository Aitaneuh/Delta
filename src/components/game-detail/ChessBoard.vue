<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { Chessground } from 'chessground'
import type { Api } from 'chessground/api'
import type { Config } from 'chessground/config'
import type { Color, Key } from 'chessground/types'

// Official Lichess Layout & Theme Asset Streams
import 'chessground/assets/chessground.base.css'
import '@/assets/board.css' // Delta's own square and highlight colors
import 'chessground/assets/chessground.cburnett.css' // Standard crisp piece set

interface Props {
  fen?: string
  orientation?: 'white' | 'black'
  lastMove?: string[] | null
  check?: Color | false
  arrow?: string | null // UCI move to draw, e.g. "e2e4"
  // Legal moves for the side to move. When empty, pieces can't be moved.
  dests?: Map<string, string[]>
}

const props = withDefaults(defineProps<Props>(), {
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  orientation: 'white',
  lastMove: null,
  check: false,
  arrow: null,
  dests: () => new Map(),
})

const emit = defineEmits<{
  move: [orig: string, dest: string]
}>()

const boardContainer = ref<HTMLDivElement | null>(null)
let boardApi: Api | null = null

function positionConfig(): Config {
  const turnColor: Color = props.fen.split(' ')[1] === 'b' ? 'black' : 'white'
  return {
    fen: props.fen,
    turnColor,
    lastMove: (props.lastMove as Key[] | null) ?? undefined,
    check: props.check,
    movable: {
      color: props.dests.size > 0 ? turnColor : undefined,
      dests: props.dests as Map<Key, Key[]>,
    },
  }
}

function showArrow() {
  const move = props.arrow
  boardApi?.setAutoShapes(
    move ? [{ orig: move.slice(0, 2) as Key, dest: move.slice(2, 4) as Key, brush: 'engine' }] : [],
  )
}

/** Puts the board back in sync with the props, e.g. after a promotion or a refused move. */
function syncBoard() {
  boardApi?.set(positionConfig())
  showArrow()
}

onMounted(() => {
  if (boardContainer.value) {
    boardApi = Chessground(boardContainer.value, {
      ...positionConfig(),
      orientation: props.orientation,
      viewOnly: false, // Must be false so the board registers right-clicks for shapes
      movable: {
        ...positionConfig().movable,
        free: false,
        showDests: true,
        events: {
          after: (orig, dest) => {
            emit('move', orig, dest)
            // The parent answers with a new position; this covers a move it didn't accept
            void nextTick(syncBoard)
          },
        },
      },
      premovable: { enabled: false },
      drawable: {
        enabled: true,
        visible: true,
        eraseOnClick: true, // Left click clears everything, exactly like Lichess
        brushes: {
          // Chessground's own colors, for arrows drawn with the right mouse button
          green: { key: 'g', color: '#15781B', opacity: 1, lineWidth: 10 },
          red: { key: 'r', color: '#882020', opacity: 1, lineWidth: 10 },
          blue: { key: 'b', color: '#003088', opacity: 1, lineWidth: 10 },
          yellow: { key: 'y', color: '#e68f00', opacity: 1, lineWidth: 10 },
          // The engine's suggested move, in the site's red
          engine: { key: 'de', color: '#dc2f2f', opacity: 0.85, lineWidth: 10 },
        },
      },
      highlight: {
        lastMove: true,
        check: true,
      },
      animation: {
        enabled: true,
        duration: 200,
      },
    })
    showArrow()
  }
})

watch(() => props.arrow, showArrow)

watch(() => [props.fen, props.dests], syncBoard)

onBeforeUnmount(() => {
  boardApi?.destroy()
  boardApi = null
})

watch(
  () => props.orientation,
  (newOrientation) => {
    if (boardApi) {
      boardApi.set({ orientation: newOrientation })
    }
  },
)
</script>

<template>
  <div class="bg-surface overflow-hidden border border-gray-800 p-1.5">
    <div
      ref="boardContainer"
      class="chessboard-container blue"
      @contextmenu.prevent
      style="width: 100%; aspect-ratio: 1/1"
    ></div>
  </div>
</template>

<style scoped>
/* Ensure the grid wrap fills out the parent dimensions fluidly */
.chessboard-container :deep(.cg-wrap) {
  width: 100%;
  height: 100%;
}
</style>
