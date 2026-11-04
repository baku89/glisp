<script setup lang="ts">
import { parse, print } from '@glisp/lang'
import { AstEditor, Repl, useGlispDocument } from '@glisp/tweeq'
import { useEventListener, useMediaQuery } from '@vueuse/core'
import { App as TqApp } from 'tweeq/App'
import { Icon } from 'tweeq/Icon'
import { PaneSplit } from 'tweeq/PaneSplit'
import { useAppConfigStore } from 'tweeq/stores/appConfig'
import { useThemeStore } from 'tweeq/stores/theme'
import { TitleBar } from 'tweeq/TitleBar'
import { vTooltip } from 'tweeq/Tooltip'
import { initTweeq } from 'tweeq/useTweeq'
import { computed, ref, useTemplateRef, watch, watchEffect } from 'vue'

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

const TOOLS = [
	{ name: 'select', tooltip: { content: 'Select', shortcut: ['V'] }, icon: 'ph:cursor-fill' },
	{ name: 'pen', tooltip: { content: 'Pen', shortcut: ['P'] }, icon: 'ph:pen-nib' },
	{ name: 'rect', tooltip: { content: 'Rectangle', shortcut: ['R'] }, icon: 'ph:rectangle' },
	{ name: 'ellipse', tooltip: { content: 'Ellipse', shortcut: ['O'] }, icon: 'ph:circle' },
] as const
const tool = ref<(typeof TOOLS)[number]['name']>('select')
const drawing = computed(() => (tool.value === 'select' ? null : tool.value))

useEventListener(window, 'keydown', (event: KeyboardEvent) => {
	const target = event.target as HTMLElement | null
	if (target?.closest?.('input, textarea, [contenteditable]')) return
	if (event.metaKey || event.ctrlKey || event.altKey) return
	const key = event.key.toLowerCase()
	// In a drawing app these are tools, before what they mean to a row in the tree.
	if (key === 'v' || key === 'p') {
		tool.value = key === 'v' ? 'select' : 'pen'
		event.stopPropagation()
	} else if (key === 'r') tool.value = 'rect'
	else if (key === 'o') tool.value = 'ellipse'
	else if (key === 'escape') tool.value = 'select'
}, { capture: true })

/** The project floats over the canvas, or is out of the way as a tab, across reloads. */
const projectOpen = useAppConfigStore().ref('glisp.canvas.project.open', true)

const selected = ref<readonly string[]>([])
const $editor = useTemplateRef<{ reveal(path: string): void; deselect(): void }>('$editor')

function selectOnCanvas(rows: readonly string[]): void {
	selected.value = rows
	const [first] = rows
	if (first === undefined) $editor.value?.deselect()
	else $editor.value?.reveal(first)
}

/** What the inspector shows: one row, as several have nothing in common to show. */
const inspected = computed(() => (selected.value.length === 1 ? selected.value[0]! : null))

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
				name="glisp.canvas.inspector"
				direction="horizontal"
				fixed="second"
				:size="320"
				:scroll="[false, false]"
			>
				<template #first>
					<div class="stage">
						<CanvasView
							:document="document"
							:selected="selected"
							:drawing="drawing"
							@select="selectOnCanvas"
						/>
						<aside v-show="projectOpen" class="project">
							<header class="project-header" data-selects-rows>
								<span class="project-title">
									<Icon icon="ph:tree-view" />
									Project
								</span>
								<button
									v-tooltip="'Minimize'"
									class="project-toggle"
									aria-label="Minimize Project"
									@click="projectOpen = false"
								>
									<Icon icon="ph:caret-left" />
								</button>
							</header>
							<div class="project-tree">
								<AstEditor
									ref="$editor"
									:document="document"
									compact
									layers
									:iconOfValue="iconOfPath"
									:alsoSelected="selected"
									@select="selectInTree"
								/>
							</div>
						</aside>
						<button
							v-show="!projectOpen"
							v-tooltip="{ content: 'Project', placement: 'right' }"
							class="project-tab"
							aria-label="Show Project"
							data-selects-rows
							@click="projectOpen = true"
						>
							<Icon icon="ph:tree-view" />
						</button>
						<div class="tools" data-selects-rows>
							<button
								v-for="{ name, tooltip, icon } in TOOLS"
								:key="name"
								v-tooltip="{ ...tooltip, shortcut: [...tooltip.shortcut] }"
								class="tool"
								:class="{ active: tool === name }"
								:aria-label="tooltip.content"
								:aria-pressed="tool === name"
								@click="tool = name"
							>
								<Icon :icon="icon" />
							</button>
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
									:document="document"
									:inspect="inspected"
									:iconOfValue="iconOfPath"
								/>
							</section>
						</template>
						<template #second>
							<section class="pane" data-selects-rows>
								<Repl
									:session="document.session"
									historyKey="glisp.canvas.history"
									noClear
									noFocus
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
	overflow: hidden;
}
/* Coming out from the left edge, so with a border on the other three sides. */
.project,
.project-tab {
	position: absolute;
	left: 0;
	border: 1px solid var(--tq-color-border);
	border-left: none;
	border-radius: 0 var(--tq-radius-pane) var(--tq-radius-pane) 0;
	background: var(--tq-color-surface);
	backdrop-filter: blur(var(--tq-popup-blur));
	/* As a popup has, the same as a modal. */
	box-shadow: 0 0 20px 0 var(--tq-color-shadow);
}
.project {
	top: 16px;
	bottom: 16px;
	display: flex;
	flex-direction: column;
	width: 240px;
}
.project-header {
	display: flex;
	flex-shrink: 0;
	align-items: center;
	justify-content: space-between;
	padding: 6px 6px 0 var(--tq-pane-padding);
}
.project-title {
	display: flex;
	gap: var(--tq-gap-related);
	align-items: center;
	font-weight: 600;
}
.project-title > :first-child {
	flex: none;
	font-size: 18px;
}
.project-toggle,
.project-tab {
	display: grid;
	place-items: center;
	border: none;
	background: none;
	color: var(--tq-color-text-mute);
	cursor: pointer;
}
.project-toggle {
	width: 24px;
	height: 24px;
	border-radius: var(--tq-radius-input);
}
.project-toggle:hover {
	background: var(--tq-color-input-hover);
	color: var(--tq-color-text);
}
.project-tab {
	top: 16px;
	width: 32px;
	height: 40px;
	border: 1px solid var(--tq-color-border);
	border-left: none;
	background: var(--tq-color-surface);
	font-size: 18px;
}
.project-tab:hover {
	color: var(--tq-color-text);
}
.project-tree {
	flex: 1;
	min-height: 0;
	padding: var(--tq-pane-padding);
}
.tools {
	--padding: 6px;
	--radius: 6px;
	position: absolute;
	bottom: 16px;
	left: 50%;
	translate: -50% 0;
	display: flex;
	gap: 2px;
	padding: var(--padding);
	border: 1px solid var(--tq-color-border);
	border-radius: calc(var(--radius) + var(--padding));
	background: var(--tq-color-surface);
	backdrop-filter: blur(var(--tq-popup-blur));
	box-shadow: 0 0 20px 0 var(--tq-color-shadow);
}
.tool {
	display: grid;
	place-items: center;
	width: 32px;
	height: 32px;
	border: none;
	border-radius: var(--radius);
	background: none;
	color: var(--tq-color-text);
	font-size: 18px;
	cursor: pointer;
}
.tool:hover {
	background: var(--tq-color-input-hover);
}
.tool.active {
	background: var(--tq-color-accent);
	color: var(--tq-color-on-accent, white);
}
.pane {
	box-sizing: border-box;
	height: 100%;
	padding: var(--tq-pane-padding);
}
</style>
