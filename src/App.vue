<script setup lang="ts">
import NavBar from './components/partials/NavBar.vue'
import SiteFooter from './components/partials/SiteFooter.vue'
</script>

<template>
  <main class="flex min-h-dvh flex-col">
    <NavBar />
    <router-view class="flex-1" />
    <SiteFooter />
  </main>
</template>
