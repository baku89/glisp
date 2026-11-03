<script setup lang="ts">
import ReplConsole from './repl/ReplConsole.vue'
</script>

<template>
	<div class="repl-frame">
		<ReplConsole />
	</div>
</template>

<style scoped>
/* The console's colors, scoped here so that they do not leak color-scheme to
 * the rest of the page. */
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
	--mono: 'Geist Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}
</style>
