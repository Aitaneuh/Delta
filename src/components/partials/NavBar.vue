<script setup lang="ts">
// Bound rather than written in the template, so the build doesn't try to import it as a module
const logoUrl = '/images/delta_analyzer_logo_white_red.png'

const links = [
  { to: '/explore', label: 'Explore' },
  { to: '/import', label: 'Import' },
  { to: '/stats', label: 'Statistics' },
]
</script>

<template>
  <header class="sticky top-0 z-30 border-b border-gray-800 bg-ink/95 backdrop-blur-sm">
    <nav
      class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-8 gap-y-2 px-4 py-3 sm:px-6"
      aria-label="Main"
    >
      <router-link to="/" class="group flex items-center gap-2.5" aria-label="Delta Analyzer, home">
        <img
          :src="logoUrl"
          alt=""
          width="26"
          height="26"
          class="transition-transform duration-300 group-hover:rotate-[-8deg]"
        />
        <span class="font-serif text-xl leading-none text-gray-100">
          Delta
          <span class="font-mono text-[11px] uppercase tracking-[0.2em] text-gray-500"
            >Analyzer</span
          >
        </span>
      </router-link>

      <ul class="flex items-center gap-6 sm:gap-8">
        <li v-for="link in links" :key="link.to">
          <router-link
            :to="link.to"
            class="nav-link py-1 text-[11px] uppercase tracking-[0.2em] text-gray-400 transition-colors hover:text-gray-100"
            >{{ link.label }}</router-link
          >
        </li>
      </ul>
    </nav>
  </header>
</template>

<style scoped>
.nav-link {
  border-bottom: 1px solid transparent;
}

.nav-link.router-link-active {
  color: var(--color-gray-100);
  border-bottom-color: var(--color-accent);
}
</style>
