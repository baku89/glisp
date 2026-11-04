<script setup lang="ts">
import { parse, print } from '@glisp/lang'
import {
	AstEditor,
	AstMultiInspector,
	AstProgramCode,
	inspectionOf,
	inspectRows,
	Repl,
	useGlispDocument,
} from '@glisp/tweeq'
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
import PaintControls from './PaintControls.vue'
import { paintedRow } from './scene'
import { bindingsOfSvg, svgOfRows } from './svg'

initTweeq('app.glisp.canvas', { accentColor: '#1473e6' })

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
		// `style` was once a member of `path`, for programs kept from then.
		const kept = source?.replaceAll('(path.style ', '(style ') ?? null
		return kept !== null && readsBack(kept) ? kept : null
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
	{ name: 'ngon', tooltip: { content: 'Polygon', shortcut: ['N'] }, icon: 'ph:polygon' },
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
	else if (key === 'n') tool.value = 'ngon'
	else if (key === 'escape') tool.value = 'select'
}, { capture: true })

/** The project floats over the canvas, or is out of the way as a tab, across reloads. */
const projectOpen = useAppConfigStore().ref('glisp.canvas.project.open', true)

const PROJECT_WIDTH = 280
const ORIGIN_MARGIN = 32
/** The top left of what the project leaves showing, and a little in from there. */
const origin = [
	(projectOpen.value
		? useAppConfigStore().ref('glisp.canvas.project.width', PROJECT_WIDTH).value
		: 32) + ORIGIN_MARGIN,
	ORIGIN_MARGIN,
] as const

const PROJECT_TABS = [
	{ name: 'layers', label: 'Project', icon: 'ph:tree-view' },
	{ name: 'code', label: 'Code', icon: 'ph:code' },
] as const
const projectTab = useAppConfigStore().ref<'layers' | 'code'>('glisp.canvas.project.tab', 'layers')
// What was kept before the REPL had a panel of its own.
if (!PROJECT_TABS.some(({ name }) => name === projectTab.value)) projectTab.value = 'layers'
const replOpen = useAppConfigStore().ref('glisp.canvas.repl.open', true)
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
const inspected = computed(() =>
	selected.value.length === 1 ? insideOf(selected.value[0]!) : null
)
/** What is there to inspect of a row, past the style it is only given. */
const insideOf = (row: string): string =>
	paintedRow(document.root.value, document.env.value, row)
const insideRows = computed(() => selected.value.map(insideOf))
/** What the row selected is called, as what it is called is the row, not what is in it. */
const selectedName = computed(() => {
	const [row] = selected.value
	return row === undefined
		? null
		: (inspectionOf(document.root.value, document.env.value, row)?.name ?? null)
})

const inspection = computed(() =>
	inspected.value === null
		? null
		: inspectionOf(document.root.value, document.env.value, inspected.value)
)

/** The function that several rows are all calls of, if they are. */
const sharedFn = computed(() =>
	selected.value.length > 1
		? (inspectRows(document.root.value, document.env.value, insideRows.value)?.fn ?? null)
		: null
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
					:origin="origin"
					:drawing="drawing"
					@select="selectOnCanvas"
				/>
				<FloatPanel
					v-model:open="projectOpen"
					name="glisp.canvas.project"
					side="left"
					label="Project"
					icon="ph:tree-view"
					:width="PROJECT_WIDTH"
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
							:copyAs="rows => svgOfRows(document.root.value, document.env.value, rows)"
							:pasteAs="bindingsOfSvg"
							@select="selectInTree"
							@code="showCode"
							@pasted="selectOnCanvas"
						/>
					</div>
					<div v-if="codeOpened" v-show="projectTab === 'code'" class="tab-content">
						<AstProgramCode :document="document" @problem="codeHasProblem = $event" />
					</div>
				</FloatPanel>
				<FloatPanel
					v-model:open="inspectorOpen"
					name="glisp.canvas.inspector"
					fit
					data-selects-rows
					side="right"
					label="Inspector"
					icon="ph:sliders-horizontal"
					:width="320"
				>
					<template #header>
						<button
							v-if="inspection?.outer && inspected === selected[0]"
							v-tooltip="'What holds this'"
							class="outer"
							aria-label="What holds this"
							@click="selectOnCanvas([inspection!.outer!])"
						>
							<Icon icon="ph:arrow-up-left" />
						</button>
						<span class="panel-title">
							<template v-if="inspection">
								<span class="name">{{ selectedName }}</span>
								<span v-if="inspection.fn" class="fn">{{ inspection.fn }}</span>
							</template>
							<template v-else-if="selected.length > 1">
								<span class="name">{{ selected.length }} selected</span>
								<span v-if="sharedFn" class="fn">{{ sharedFn }}</span>
							</template>
						</span>
					</template>
					<PaintControls v-if="selected.length > 0" :document="document" :rows="selected" />
					<AstMultiInspector v-if="selected.length > 1" :document="document" :rows="insideRows" />
					<AstEditor
						v-else
						:document="document"
						:inspect="inspected"
						:iconOfValue="iconOfPath"
					/>
				</FloatPanel>
				<FloatPanel
					v-model:open="replOpen"
					name="glisp.canvas.repl"
					side="right"
					label="REPL"
					icon="ph:terminal"
					:width="320"
					:bottomHeight="240"
				>
					<template #header>
						<span class="panel-title">
							<span class="name">REPL</span>
						</span>
					</template>
					<div class="tab-content repl" data-selects-rows>
						<Repl
							:session="document.session"
							historyKey="glisp.canvas.history"
							noClear
							noFocus
							@change="document.sync()"
						/>
					</div>
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
.tab-content.repl {
	box-sizing: border-box;
	padding-right: calc(var(--tq-pane-padding) - 2px);
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
