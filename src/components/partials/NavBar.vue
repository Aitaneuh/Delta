<template>
  <nav class="navbar p-5 flex flex-wrap items-center gap-x-6 gap-y-3 top-0 z-0 bg-zinc-950">
    <div class="logo">
      <router-link to="/" class="logo-link">
        <img :src="logoUrl" alt="Delta Analyzer logo" width="30" height="30" />
        <span>Delta <span class="text-accent">Analyzer</span></span>
      </router-link>
    </div>
    <ul>
      <li><router-link to="/">Explore</router-link></li>
      <li><router-link to="/import">Import</router-link></li>
      <li><router-link to="/stats">Statistics</router-link></li>
    </ul>
    <!-- Same width as the logo column, so the links stay centered -->
    <div class="spacer" aria-hidden="true"></div>
  </nav>
</template>

<script setup lang="ts">
const logoUrl = '/images/delta_analyzer_logo_white_red.png'
</script>

<style scoped>
ul {
  display: flex;
  list-style: none;
  gap: clamp(1.5rem, 10vw, 150px);
  margin: 0;
  align-items: center;
}

ul a {
  color: var(--text-color);
  text-decoration: none;
}

span {
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.logo {
  flex: 1 1 auto;
}

.logo-link {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: inherit;
  cursor: pointer;
  transition: 300ms;
}

.logo-link:hover {
  opacity: 0.8;
}

.logo .router-link-active {
  border-bottom: none;
}

.router-link-active {
  border-bottom: 2px solid var(--accent-color);
}

.spacer {
  display: none;
}

/* From tablet up, equal-width side columns keep the links centered in the bar. */
@media (min-width: 900px) {
  .logo,
  .spacer {
    display: block;
    flex: 1 1 0;
  }
}
</style>
