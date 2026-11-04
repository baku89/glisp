<script setup lang="ts">
import { parse, print } from '@glisp/lang'
import { AstEditor, Repl, useGlispDocument } from '@glisp/tweeq'
import { useMediaQuery } from '@vueuse/core'
import { App as TqApp } from 'tweeq/App'
import { InputRadio } from 'tweeq/InputRadio'
import { PaneSplit } from 'tweeq/PaneSplit'
import { useThemeStore } from 'tweeq/stores/theme'
import { TitleBar } from 'tweeq/TitleBar'
import { initTweeq } from 'tweeq/useTweeq'
import { ref, useTemplateRef, watch, watchEffect } from 'vue'

import CanvasView from './CanvasView.vue'
import { withGraphics } from './graphics'

initTweeq('app.glisp.canvas', { accentColor: '#0000ff' })

const theme = useThemeStore()
const prefersDark = useMediaQuery('(prefers-color-scheme: dark)')
watchEffect(() => {
	theme.colorMode = prefersDark.value ? 'dark' : 'light'
})

const EXAMPLE = `{
  radius = 60
  c = (path.circle [240 200] radius)
  r = (path.rect [360 140] [520 260])
}`

// The program stays across reloads, as source, in this browser.
const STORAGE_KEY = 'glisp.canvas.source'

const readsBack = (source: string): boolean => {
	try {
		return parse(source).kind === 'let'
	} catch {
		return false
	}
}

function stored(): string | null {
	try {
		const source = localStorage.getItem(STORAGE_KEY)
		return source !== null && readsBack(source) ? source : null
	} catch {
		return null
	}
}

const document = useGlispDocument(stored() ?? EXAMPLE, { env: withGraphics })

watch(document.root, root => {
	const source = print(root)
	if (!readsBack(source)) return
	try {
		localStorage.setItem(STORAGE_KEY, source)
	} catch {
		// With nowhere to keep it, it lasts as long as the page.
	}
})

const tool = ref('select')

const selected = ref<string | null>(null)
const $editor = useTemplateRef<{ reveal(path: string): void }>('$editor')

function selectOnCanvas(row: string | null): void {
	selected.value = row
	if (row !== null) $editor.value?.reveal(row)
}
</script>

<template>
	<TqApp>
		<template #title>
			<TitleBar name="Glisp / Canvas" icon="favicon.svg">
				<template #center>
					<InputRadio
						v-model="tool"
						:options="['select']"
						:icons="['ph:cursor-fill']"
					/>
				</template>
			</TitleBar>
		</template>
		<template #default>
			<PaneSplit
				name="glisp.canvas"
				direction="horizontal"
				fixed="second"
				:size="360"
				:scroll="[false, false]"
			>
				<template #first>
					<CanvasView
						:document="document"
						:selected="selected"
						@select="selectOnCanvas"
					/>
				</template>
				<template #second>
					<PaneSplit
						name="glisp.canvas.side"
						direction="vertical"
						fixed="second"
						:size="200"
						:scroll="[false, false]"
					>
						<template #first>
							<section class="pane">
								<AstEditor
									ref="$editor"
									:document="document"
									@select="selected = $event ?? selected"
								/>
							</section>
						</template>
						<template #second>
							<section class="pane">
								<Repl
									:session="document.session"
									historyKey="glisp.canvas.history"
									@change="document.sync()"
								/>
							</section>
						</template>
					</PaneSplit>
				</template>
			</PaneSplit>
		</template>
	</TqApp>
</template>

<style scoped>
.pane {
	box-sizing: border-box;
	height: 100%;
	padding: var(--tq-pane-padding);
}
</style>
