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
import { iconOfPath, withGraphics } from './graphics'

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

const selected = ref<readonly string[]>([])
const $editor = useTemplateRef<{ reveal(path: string): void; deselect(): void }>('$editor')

function selectOnCanvas(rows: readonly string[]): void {
	selected.value = rows
	const [first] = rows
	if (first === undefined) $editor.value?.deselect()
	else $editor.value?.reveal(first)
}

// A row that is one of several stays one of several, as the tree only has the one.
function selectInTree(row: string | null): void {
	if (row === null) selected.value = []
	else if (!selected.value.includes(row)) selected.value = [row]
}
</script>

<template>
	<TqApp>
		<template #title>
			<TitleBar name="Glisp / Canvas" icon="favicon.svg" />
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
					<div class="stage">
						<CanvasView
							:document="document"
							:selected="selected"
							@select="selectOnCanvas"
						/>
						<div class="tools" data-selects-rows>
							<InputRadio
								v-model="tool"
								:options="['select']"
								:icons="['ph:cursor-fill']"
								:tooltips="['Select']"
							/>
						</div>
					</div>
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
									compact
									:iconOfValue="iconOfPath"
									:alsoSelected="selected"
									@select="selectInTree"
								/>
							</section>
						</template>
						<template #second>
							<section class="pane">
								<Repl
									:session="document.session"
									historyKey="glisp.canvas.history"
									noClear
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
.stage {
	position: relative;
	height: 100%;
}
.tools {
	position: absolute;
	bottom: calc(var(--tq-pane-padding) * 2);
	left: 50%;
	translate: -50% 0;
	padding: var(--tq-gap-related);
	border: 1px solid var(--tq-color-border);
	border-radius: calc(var(--tq-radius-input) + var(--tq-gap-related));
	background: var(--tq-color-surface);
	backdrop-filter: blur(var(--tq-popup-blur));
}
.pane {
	box-sizing: border-box;
	height: 100%;
	padding: var(--tq-pane-padding);
}
</style>
