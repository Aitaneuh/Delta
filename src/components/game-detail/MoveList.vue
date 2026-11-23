<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { GRADE_SYMBOLS, type MoveGrade, type MoveReport } from '@/services/gameAnalysis'
import type { Variation } from '@/services/variations'

interface Props {
  moves: string[]
  currentMoveIndex: number
  reports?: MoveReport[]
  variations?: Variation[]
  activeVariation?: { id: number; ply: number } | null
  variationGrades?: Map<number, (MoveGrade | null)[]>
}

const props = withDefaults(defineProps<Props>(), {
  reports: undefined,
  variations: () => [],
  activeVariation: null,
  variationGrades: () => new Map(),
})

const emit = defineEmits<{
  goToMove: [index: number]
  goToVariationMove: [id: number, ply: number]
  removeVariation: [id: number]
}>()

/** Variations listed under a row of the move list: the row holding the move they replace. */
function variationsForRow(row: number): Variation[] {
  const lastRow = movePairs.value.length - 1
  return props.variations.filter(
    (variation) => Math.min(Math.floor(variation.startIndex / 2), lastRow) === row,
  )
}

function isActiveVariationMove(id: number, ply: number): boolean {
  return props.activeVariation?.id === id && props.activeVariation.ply === ply
}

function gradeColor(grade: MoveGrade | null | undefined): string {
  if (grade === 'blunder') return 'text-blunder'
  if (grade === 'mistake') return 'text-mistake'
  return 'text-inaccuracy'
}

// Group moves into pairs (white, black)
const movePairs = computed(() => {
  const pairs: Array<{ moveNumber: number; white: string | null; black: string | null; whiteIndex: number; blackIndex: number | null }> = []

  for (let i = 0; i < props.moves.length; i += 2) {
    pairs.push({
      moveNumber: Math.floor(i / 2) + 1,
      white: props.moves[i] || null,
      black: props.moves[i + 1] || null,
      whiteIndex: i + 1, // Index after this move (0-indexed becomes 1-indexed)
      blackIndex: i + 1 < props.moves.length ? i + 2 : null,
    })
  }

  return pairs
})

function handleMoveClick(index: number) {
  emit('goToMove', index)
}

/** The "??" style mark for the move that produced this position, if any. */
function gradeSymbol(index: number): string {
  const grade = props.reports?.[index - 1]?.grade
  return grade ? GRADE_SYMBOLS[grade] : ''
}

function gradeClass(index: number): string {
  if (isActiveMoveIndex(index)) return 'text-white'
  return gradeColor(props.reports?.[index - 1]?.grade)
}

function isActiveMoveIndex(index: number): boolean {
  return !props.activeVariation && props.currentMoveIndex === index
}

// Keep the current move visible. Only the list scrolls, never the page.
const scroller = ref<HTMLElement | null>(null)

watch(
  () => [props.currentMoveIndex, props.activeVariation?.id, props.activeVariation?.ply],
  async () => {
    await nextTick()
    const list = scroller.value
    const active = list?.querySelector<HTMLElement>('[data-active="true"]')
    if (list && active) {
      list.scrollTop = active.offsetTop - list.clientHeight / 2 + active.offsetHeight / 2
    }
  },
)
</script>

<template>
  <div class="bg-surface rounded-lg border border-gray-800 h-full flex flex-col">
    <div class="border-b border-gray-800 px-4 py-3">
      <h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wide">
        Moves
      </h3>
    </div>

    <div ref="scroller" class="relative flex-1 min-h-0 overflow-y-auto p-4 space-y-1">
      <!-- Starting position -->
      <button type="button" class="flex w-full items-center space-x-2 px-2 py-1.5 rounded cursor-pointer transition"
        :class="currentMoveIndex === 0 ? 'bg-accent text-white' : 'hover:bg-gray-800 text-gray-400'"
        :data-active="currentMoveIndex === 0"
        @click="handleMoveClick(0)">
        <span class="text-xs font-mono">Start</span>
      </button>

      <!-- Move pairs -->
      <template v-for="(pair, row) in movePairs" :key="pair.moveNumber">
      <div class="flex items-start space-x-2 text-sm">
        <span class="text-gray-600 font-mono min-w-[2rem] text-right">
          {{ pair.moveNumber }}.
        </span>

        <div class="flex-1 min-w-0 grid grid-cols-2 gap-1">
          <!-- White move -->
          <button v-if="pair.white" class="flex-1 text-left px-2 py-1 rounded font-mono text-xs transition cursor-pointer" :class="isActiveMoveIndex(pair.whiteIndex)
            ? 'bg-accent text-white font-semibold'
            : 'text-gray-300 hover:bg-gray-800'" :data-active="isActiveMoveIndex(pair.whiteIndex)" @click="handleMoveClick(pair.whiteIndex)">
            {{ pair.white }}<span class="font-bold" :class="gradeClass(pair.whiteIndex)">{{ gradeSymbol(pair.whiteIndex) }}</span>
          </button>

          <!-- Black move -->
          <button v-if="pair.black" class="flex-1 text-left px-2 py-1 rounded font-mono text-xs transition cursor-pointer" :class="isActiveMoveIndex(pair.blackIndex!)
            ? 'bg-accent text-white font-semibold'
            : 'text-gray-300 hover:bg-gray-800'" :data-active="isActiveMoveIndex(pair.blackIndex!)" @click="handleMoveClick(pair.blackIndex!)">
            {{ pair.black }}<span class="font-bold" :class="gradeClass(pair.blackIndex!)">{{ gradeSymbol(pair.blackIndex!) }}</span>
          </button>
        </div>
      </div>

      <!-- Variations played on the board, under the move they replace -->
      <div v-for="variation in variationsForRow(row)" :key="`variation-${variation.id}`"
        class="ml-10 flex items-start gap-1 rounded border-l-2 border-gray-600 bg-sunken py-1 pl-2 pr-1">
        <div class="flex-1 min-w-0 flex flex-wrap items-center gap-x-0.5 gap-y-0.5 font-mono text-xs">
          <template v-for="(move, index) in variation.moves" :key="index">
            <span v-if="move.color === 'white' || index === 0" class="text-gray-600 pl-1">
              {{ move.moveNumber }}{{ move.color === 'white' ? '.' : '...' }}
            </span>
            <button type="button" class="px-1 py-0.5 rounded transition cursor-pointer"
              :class="isActiveVariationMove(variation.id, index + 1)
                ? 'bg-accent text-white font-semibold'
                : 'text-gray-400 hover:bg-gray-800'"
              :data-active="isActiveVariationMove(variation.id, index + 1)"
              @click="emit('goToVariationMove', variation.id, index + 1)">
              {{ move.san }}<span v-if="variationGrades.get(variation.id)?.[index]" class="font-bold"
                :class="isActiveVariationMove(variation.id, index + 1) ? 'text-white' : gradeColor(variationGrades.get(variation.id)?.[index])">{{ GRADE_SYMBOLS[variationGrades.get(variation.id)![index]!] }}</span>
            </button>
          </template>
        </div>
        <button type="button" title="Remove this variation" aria-label="Remove this variation"
          class="shrink-0 px-1.5 text-gray-500 hover:text-gray-200 cursor-pointer leading-5"
          @click="emit('removeVariation', variation.id)">
          &times;
        </button>
      </div>
      </template>

      <div v-if="moves.length === 0" class="text-center text-gray-600 py-8 text-sm">
        No moves recorded
      </div>
    </div>
  </div>
</template>