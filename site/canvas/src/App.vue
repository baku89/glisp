<script setup lang="ts">
import { parse, print } from '@glisp/lang'
import { AstEditor, AstProgramCode, inspectionOf, Repl, useGlispDocument } from '@glisp/tweeq'
import { useEventListener, useMediaQuery } from '@vueuse/core'
import { App as TqApp } from 'tweeq/App'
import { Icon } from 'tweeq/Icon'
import { useAppConfigStore } from 'tweeq/stores/appConfig'
import { useThemeStore } from 'tweeq/stores/theme'
import { TitleBar } from 'tweeq/TitleBar'
import { vTooltip } from 'tweeq/Tooltip'
import { initTweeq } from 'tweeq/useTweeq'
import { computed, ref, useTemplateRef, watch, watchEffect } from 'vue'

import CanvasView from './CanvasView.vue'
import FloatPanel from './FloatPanel.vue'
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
  r = (path.rect [360 140] [160 120])
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

const PROJECT_TABS = [
	{ name: 'layers', label: 'Project', icon: 'ph:tree-view' },
	{ name: 'code', label: 'Code', icon: 'ph:code' },
	{ name: 'repl', label: 'REPL', icon: 'ph:terminal' },
] as const
const projectTab = useAppConfigStore().ref<'layers' | 'code' | 'repl'>(
	'glisp.canvas.project.tab',
	'layers'
)
const inspectorOpen = useAppConfigStore().ref('glisp.canvas.inspector.open', true)
/** The editor is there once it has been asked for, and stays, with what is written in it. */
const codeOpened = ref(projectTab.value === 'code')
watch(projectTab, tab => {
	if (tab === 'code') codeOpened.value = true
})
const codeHasProblem = ref(false)

function showCode(): void {
	projectOpen.value = true
	projectTab.value = 'code'
}

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

const inspection = computed(() =>
	inspected.value === null
		? null
		: inspectionOf(document.root.value, document.env.value, inspected.value)
)

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
			<div class="stage">
				<CanvasView
					:document="document"
					:selected="selected"
					:drawing="drawing"
					@select="selectOnCanvas"
				/>
				<FloatPanel
					v-model:open="projectOpen"
					name="glisp.canvas.project"
					side="left"
					label="Project"
					icon="ph:tree-view"
					:width="280"
				>
					<template #header>
						<div class="tabs" role="tablist">
							<button
								v-for="{ name, label, icon } in PROJECT_TABS"
								:key="name"
								class="tab"
								:class="{ active: projectTab === name }"
								role="tab"
								:aria-selected="projectTab === name"
								@click="projectTab = name"
							>
								<Icon :icon="icon" />
								{{ label }}
								<span
									v-if="name === 'code' && codeHasProblem"
									class="problem-dot"
									aria-label="This cannot be read"
								/>
							</button>
						</div>
					</template>
					<div v-show="projectTab === 'layers'" class="tab-content">
						<AstEditor
							ref="$editor"
							:document="document"
							compact
							layers
							:iconOfValue="iconOfPath"
							:alsoSelected="selected"
							@select="selectInTree"
							@code="showCode"
							@pasted="selectOnCanvas"
						/>
					</div>
					<div v-if="codeOpened" v-show="projectTab === 'code'" class="tab-content">
						<AstProgramCode :document="document" @problem="codeHasProblem = $event" />
					</div>
					<div v-show="projectTab === 'repl'" class="tab-content" data-selects-rows>
						<Repl
							:session="document.session"
							historyKey="glisp.canvas.history"
							noClear
							noFocus
							@change="document.sync()"
						/>
					</div>
				</FloatPanel>
				<FloatPanel
					v-model:open="inspectorOpen"
					name="glisp.canvas.inspector"
					fit
					side="right"
					label="Inspector"
					icon="ph:sliders-horizontal"
					:width="320"
				>
					<template #header>
						<button
							v-if="inspection?.outer"
							v-tooltip="'What holds this'"
							class="outer"
							aria-label="What holds this"
							@click="selectOnCanvas([inspection!.outer!])"
						>
							<Icon icon="ph:arrow-up-left" />
						</button>
						<span class="panel-title">
							<template v-if="inspection">
								<span class="name">{{ inspection.name }}</span>
								<span v-if="inspection.fn" class="fn">{{ inspection.fn }}</span>
							</template>
							<span v-else-if="selected.length > 1" class="name">
								{{ selected.length }} selected
							</span>
						</span>
					</template>
					<AstEditor
						:document="document"
						:inspect="inspected"
						:iconOfValue="iconOfPath"
					/>
				</FloatPanel>
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
	</TqApp>
</template>

<style scoped>
.stage {
	position: relative;
	height: 100%;
	overflow: hidden;
}
.tabs {
	display: flex;
	gap: 2px;
}
.tab,
.panel-title {
	display: flex;
	gap: var(--tq-gap-related);
	align-items: center;
	height: 24px;
	padding-inline: 6px;
}
.panel-title {
	flex: 1;
	min-width: 0;
	white-space: nowrap;
}
.panel-title .name {
	overflow: hidden;
	text-overflow: ellipsis;
	font-weight: 600;
}
.panel-title .fn {
	overflow: hidden;
	color: var(--tq-color-text-mute);
	text-overflow: ellipsis;
}
.outer {
	display: grid;
	flex: none;
	place-items: center;
	width: 24px;
	height: 24px;
	border: none;
	border-radius: var(--tq-radius-input);
	background: none;
	color: var(--tq-color-text-mute);
	cursor: pointer;
}
.outer:hover {
	background: var(--tq-color-input-hover);
	color: var(--tq-color-text);
}
.tab {
	border: none;
	border-radius: var(--tq-radius-input);
	background: none;
	color: var(--tq-color-text-mute);
	cursor: pointer;
}
.tab:hover {
	color: var(--tq-color-text);
}
.tab.active {
	background: var(--tq-color-input);
	color: var(--tq-color-text);
	font-weight: 600;
}
.tab-content {
	height: 100%;
}
.problem-dot {
	width: 6px;
	height: 6px;
	border-radius: 50%;
	background: var(--tq-color-error);
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
