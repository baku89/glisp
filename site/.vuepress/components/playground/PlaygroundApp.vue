<script setup lang="ts">
import { AstEditor, Repl, useGlispDocument } from '@glisp/tweeq'
import { TweeqProvider } from 'tweeq/TweeqProvider'
import { Viewport } from 'tweeq/Viewport'

const document = useGlispDocument(`{
  radius = 40
  scale = 1.5
  label = "circle"
  round = true
  area = (* pi (** radius 2))
  sizes = (map [radius (* radius scale)] (* % 2))
  biggest = (reduce sizes 0 max)
}`)
</script>

<template>
	<TweeqProvider>
		<Viewport class="PlaygroundApp">
			<section class="editor">
				<AstEditor :document="document" />
			</section>
			<section class="console">
				<Repl :session="document.session" @change="document.sync()" />
			</section>
		</Viewport>
	</TweeqProvider>
</template>

<style scoped>
.PlaygroundApp {
	display: grid;
	grid-template-columns: minmax(320px, 1fr) minmax(320px, 1fr);
	gap: 16px;
	height: calc(100vh - var(--navbar-height, 3.6rem));
	padding: 16px;
	box-sizing: border-box;
	background: var(--tq-color-background);
}
.editor {
	min-width: 0;
	overflow: auto;
	/* It scrolls, which would clip the ring of a focused input at its edge. */
	padding: 2px;
}
.console {
	min-width: 0;
	min-height: 0;
}
@media (max-width: 760px) {
	.PlaygroundApp {
		grid-template-columns: 1fr;
		height: auto;
	}
}
</style>
