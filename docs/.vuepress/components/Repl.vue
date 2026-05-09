<script setup lang="ts">
// Re-export the existing playground REPL as a VuePress component so the
// docs and the live playground share a single implementation. Both
// trees see `@core/*` thanks to the alias in `.vuepress/config.ts`.
import PlaygroundRepl from '../../../playground/src/components/Repl.vue'
</script>

<template>
	<div class="repl-frame">
		<PlaygroundRepl />
	</div>
</template>

<style scoped>
/* The playground's Repl.vue references theme CSS vars defined in the
 * playground's global stylesheet. Scope a copy here so the embed works
 * inside VuePress without leaking color-scheme to the rest of the page. */
.repl-frame {
	color-scheme: dark;
	--bg: #0d1117;
	--bg-input: #161b22;
	--bg-line: #11161d;
	--bg-line-alt: #0d1320;
	--border: #21262d;
	--border-strong: #30363d;
	--fg: #c9d1d9;
	--fg-dim: #6e7681;
	--fg-hint: #484f58;
	--accent: #58a6ff;
	--accent-warm: #d2a8ff;
	--token-number: #f2cc60;
	--token-string: #7ee787;
	--token-boolean: #ff7b72;
	--token-symbol: #79c0ff;
	--token-punct: #6e7681;
	--token-closure: #79c0ff;
	--token-type: #56d4dd;
	--token-hostfn: #6e7681;
	--token-unit: #6e7681;
	--diag-error: #ff7b72;
	--diag-warning: #f2cc60;
	--diag-info: #58a6ff;
	--mono: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}
</style>
