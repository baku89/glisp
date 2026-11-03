<script setup lang="ts">
import { AstEditor, Repl, useGlispDocument } from '@glisp/tweeq'
import { useMediaQuery, useMutationObserver } from '@vueuse/core'
import { PaneSplit } from 'tweeq/PaneSplit'
import { useThemeStore } from 'tweeq/stores/theme'
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

// The site's own switch says which it is, on the root element. Tweeq's blue sinks
// into a dark background, so there it takes the site's accent.
const LIGHT_ACCENT = '#0000ff'
const theme = useThemeStore()
function followSite(): void {
	const root = window.document.documentElement
	const dark = root.dataset.theme === 'dark'
	theme.colorMode = dark ? 'dark' : 'light'
	theme.accentColor = dark
		? getComputedStyle(root).getPropertyValue('--vp-c-accent').trim() || LIGHT_ACCENT
		: LIGHT_ACCENT
}
followSite()
useMutationObserver(window.document.documentElement, followSite, {
	attributes: true,
	attributeFilter: ['data-theme'],
})
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
