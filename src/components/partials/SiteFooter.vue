<script setup lang="ts">
const links = [
  { to: '/legal', label: 'Legal notice' },
  { to: '/privacy', label: 'Privacy' },
  { to: '/terms', label: 'Terms' },
  { to: '/licenses', label: 'Open source' },
]
</script>

<template>
  <footer class="border-t border-gray-800 bg-ink">
    <div
      class="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-xs text-gray-500 sm:flex-row sm:items-center sm:justify-between sm:px-6"
    >
      <p>
        <span class="font-serif text-sm text-gray-300">Delta</span>
        · Free software under the GPL-3.0. Analysis by Stockfish.
      </p>
      <ul class="flex flex-wrap gap-x-5 gap-y-2">
        <li v-for="link in links" :key="link.to">
          <router-link :to="link.to" class="transition-colors hover:text-gray-200">{{
            link.label
          }}</router-link>
        </li>
      </ul>
    </div>
  </footer>
</template>
