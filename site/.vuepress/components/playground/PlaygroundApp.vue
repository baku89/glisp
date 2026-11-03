<script setup lang="ts">
import { AstEditor, Repl, useGlispDocument } from '@glisp/tweeq'
import { useMediaQuery } from '@vueuse/core'
import { PaneSplit } from 'tweeq/PaneSplit'
import { TweeqProvider } from 'tweeq/TweeqProvider'
import { Viewport } from 'tweeq/Viewport'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

self.MonacoEnvironment = { getWorker: () => new EditorWorker() }

const document = useGlispDocument(`{
  radius = 40
  scale = 1.5
  label = "circle"
  round = true
  area = (* pi (** radius 2))
  sizes = (map [radius (* radius scale)] (* % 2))
  biggest = (reduce sizes 0 max)
}`)

const isNarrow = useMediaQuery('(max-width: 760px)')
</script>

<template>
	<TweeqProvider>
		<Viewport class="PlaygroundApp">
			<PaneSplit
				name="glisp.playground"
				:direction="isNarrow ? 'vertical' : 'horizontal'"
				:scroll="[false, false]"
			>
				<template #first>
					<section class="repl">
						<Repl :session="document.session" @change="document.sync()" />
					</section>
				</template>
				<template #second>
					<section class="env">
						<AstEditor :document="document" />
					</section>
				</template>
			</PaneSplit>
		</Viewport>
	</TweeqProvider>
</template>

<style scoped>
.PlaygroundApp {
	/* Under the navbar, with nothing of the page around it to scroll. */
	position: fixed;
	inset: var(--navbar-height, 3.6rem) 0 0;
	background: var(--tq-color-background);
	--tq-font-code: 'Fira Code', monospace;
	font-variant-ligatures: contextual common-ligatures;
}
.repl,
.env {
	box-sizing: border-box;
	height: 100%;
	padding: var(--tq-pane-padding);
}
</style>
