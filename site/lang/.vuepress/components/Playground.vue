<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

// Tweeq only runs in the browser, so it is not even imported while prerendering.
const PlaygroundApp = defineAsyncComponent(
	() => import('./playground/PlaygroundApp.vue')
)
</script>

<template>
	<ClientOnly>
		<PlaygroundApp />
	</ClientOnly>
</template>
