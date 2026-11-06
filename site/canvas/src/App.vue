<script setup lang="ts">
import { type AST, buildPrelude, LetAST, parse, print, type TypeValue, VecAST } from '@glisp/lang'
import {
	AstEditor,
	AstMultiInspector,
	AstProgramCode,
	formatOneExpression,
	inspectionOf,
	useGlispDocument,
} from '@glisp/tweeq'
import { combined, type Filter, filtersFor, functionsOfProgram, nameMadeBy, wrappedAt } from '@glisp/tweeq/filters'
import { copiedBySlotCommand, copiedRows, reach, slotCommandAt, withBlanks, withSlotCommand } from '@glisp/tweeq/rowsClipboard'
import { MAIN, layersOf, renameBindingAt, withLayerAdded, SLOT_COMMANDS, type SlotCommand, slotCommandOfKey } from '@glisp/tweeq/structure'
import { useEventListener, useMediaQuery } from '@vueuse/core'
import type { mat2d } from 'linearly'
import { App as TqApp } from 'tweeq/App'
import { Icon } from 'tweeq/Icon'
import { useAppConfigStore } from 'tweeq/stores/appConfig'
import { useActionsStore } from 'tweeq/stores/actions'
import { useThemeStore } from 'tweeq/stores/theme'
import { Menu, type MenuItem } from 'tweeq/Menu'
import { Popover } from 'tweeq/Popover'
import { InputNumber, scaledBy } from 'tweeq/InputNumber'
import { TitleBar } from 'tweeq/TitleBar'
import { useToastStore } from 'tweeq/Toast'
import { useHostDelete } from '@glisp/tweeq'
import { vTooltip } from 'tweeq/Tooltip'
import { initTweeq } from 'tweeq/useTweeq'
import { computed, nextTick, provide, ref, shallowRef, useTemplateRef, watch, watchEffect } from 'vue'

import CanvasView from './CanvasView.vue'
import { exportSvg } from './files'
import { sourceOfProgram } from '@glisp/tweeq/programSource'
import FileTabs from './FileTabs.vue'
import { useFileTabs } from './useFileTabs'
import FloatPanel from './FloatPanel.vue'
import { iconOfFunction, SHAPE_ICONS } from './functionIcons'
import QuickAdd, { type QuickAddItem } from './QuickAdd.vue'
import { addablesIn, fillersAt, withAdded, withFilled } from './quickAdd'
import { ARTBOARD_ICON, type ArtboardValue, isArtboard, iconOfPath, inkOn, type Path, PathValue, withGraphics, isRect, type RectValue, type Vec } from './graphics'
import PaintControls from './PaintControls.vue'
import ToolPanel from './ToolPanel.vue'
import { alone, type Place } from './panelLayout'
import { PANEL_DOCK, usePanelLayout } from './usePanelLayout'
import { withPaintsSwapped } from './paintArguments'
import { loadedSource, PAINT_ROW, paintOfAttributes, shapeAttributesOf, sourceOfAttributes, withAttribute, withPaintAdded } from './toolAttributes'
import IsolationBar from './IsolationBar.vue'
import RowName from './RowName.vue'
import {
	pickedRows,
	type Arrange,
	arranged,
	type Area,
	crumbsOf,
	boundsOfRows,
	exportedRows,
	grouped,
	nameOfRow,
	rowCalled,
	rowsAbout,
	ungrouped,
	viewToFit,
	withFileDropped,
	withSolid,
	withAxesToggled,
	withGraphPaperToggled,
} from './rows'
import { solidOf, canIsolate, diveAt, drawsAt, labelOfRow, rowsListedIn, axesCall, graphPaperCall, isOfCanvasAt, isWithin, paintAt, paintedRow, pathOfRow, rowsPaintedBy, rowsToTake, valueOfRow, withPaintOfRows, withLayersFromOrder, writtenAsNow, isOutlined, sceneOf } from './scene'
import {
	actionTypesOver,
	copyableType,
	exportableType,
	ungroupableType,
	drawingType,
	numberType,
	pathType,
	rowType,
	type Selected,
	selectedOf,
	slotTypes,
	valueTextOf,
} from './selection'
import { bindingsOfSvg, programInFile, svgOfProgram, svgOfRows } from './svg'
import ToolBar from './ToolBar.vue'
import { arranged as arrangedTools, barPanel, type FirstTools, MAIN_BAR } from './toolbar'

initTweeq('app.glisp.canvas', { accentColor: '#1473e6' })

const theme = useThemeStore()
const prefersDark = useMediaQuery('(prefers-color-scheme: dark)')
watchEffect(() => {
	theme.colorMode = prefersDark.value ? 'dark' : 'light'
})

const EXAMPLE = `{
  radius = 60
  main = [
    c = (path.circle [240 200] radius)
    r = (path.rect [360 140] [160 120])
    axes1 = (axes)
    graphPaper1 = (graphPaper "dots")
  ]
}`

/**
 * A program to read to see how one is written. What is only said is the graph, in any order,
 * and the vector is what is drawn, the first in front, as it is on top in a list of layers.
 */
const NEW_SKETCH = `{
  ; What is only named is not drawn, and it does not matter which comes first.
  size = 120
  gap = 20
  ring = (path.circle [0 0] size)

  ; What it draws is main, which is what it comes to. What comes first is in front,
  ; and on top in Project.
  main = [
    ; A vector with names in it is a group, which goes on the canvas as one.
    marks = [
      left = (style (path.circle [-60 0] 16) fill: "#ffffff")
      right = (style (path.circle [60 0] 16) fill: "#ffffff")
    ]

    ; Made from what is named above, which itself draws nothing.
    disc = (style ring fill: "#1473e6")
    halo = (style (path.offset ring gap) stroke: "#1473e6" width: 2)

    ; A name lets the rest of it refer to this, by its name in here, or by a path from anywhere.
    plate = (style (path.rect [-200 -200] [400 400]) fill: "#f0ece2")

    ; These are layers like the rest: moved to the front, they cover what is behind.
    axes1 = (axes)
    graphPaper1 = (graphPaper "dots")
    solid1 = (solid "#ffffff")
  ]
}`

// The program stays across reloads, as source, in this browser.
const STORAGE_KEY = 'glisp.canvas.source'

/**
 * A program as written now, from what was written before: `style` was once a member of
 * `path`, what a rectangle starts from was once its `topLeft`, and what was drawn went by
 * the order of its bindings.
 */
const graphicsEnv = withGraphics(buildPrelude())
function fromBefore(source: string): string {
	const written = writtenAsNow(source)
	try {
		return print(withLayersFromOrder(parse(written), graphicsEnv))
	} catch {
		return written
	}
}

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
		const kept = source === null ? null : fromBefore(source)
		return kept !== null && readsBack(kept) ? kept : null
	} catch {
		return null
	}
}

const document = useGlispDocument(stored() ?? EXAMPLE, { env: withGraphics })

const toasts = useToastStore()
/** What says that what referred to something deleted is now a value, while it does. */
let keptToast: number | null = null
/**
 * That `rows` referred to what has just been deleted and are now what they came to, said out
 * of the way: with going back to `before`, just before the deleting, whatever is done since,
 * as a step of its own, for that to be undone too.
 */
function sayKept(rows: readonly string[], before: AST): void {
	const names = [...new Set(rows.map(row => /^binding:([^/]+)/.exec(row)?.[1] ?? row))]
	const listed = names.length <= 3 ? names.join(', ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`
	if (keptToast !== null) toasts.dismiss(keptToast)
	keptToast = toasts.show({
		icon: 'mdi:link-variant-off',
		tone: 'warning',
		message: `${listed} referred to what was deleted, and ${names.length === 1 ? 'keeps the value it' : 'keep the values they'} had.`,
		actions: [
			{
				label: 'Revert',
				tooltip: 'Back to just before it was deleted. This can be undone.',
				perform: () => {
					// Not more of whatever was done last, which undoing it would take away with it.
					document.release()
					if (before.kind === 'let') document.setRoot(before)
				},
			},
		],
	})
}

watch(document.root, root => {
	const source = print(root)
	if (!readsBack(source)) return
	try {
		localStorage.setItem(STORAGE_KEY, source)
	} catch {
		// With nowhere to keep it, it lasts as long as the page.
	}
})

/** A tool's key is said only here. What runs it and what says so all come from this. */
/** What takes a path, but is what the inspector says of one, more than something around it. */
const NOT_FILTERS: ReadonlySet<string> = new Set(['style', 'solid'])

const TOOLS = [
	{ name: 'select', label: 'Select', key: 'v', icon: 'ph:cursor-fill' },
	{ name: 'points', label: 'Edit Points', key: 'a', icon: 'ph:cursor' },
	{ name: 'pen', label: 'Pen', key: 'p', icon: 'ph:pen-nib' },
	{ name: 'pencil', label: 'Pencil', key: 'b', icon: 'ph:pencil-simple' },
	{ name: 'artboard', label: 'Artboard', key: 'f', icon: ARTBOARD_ICON },
	{ name: 'rect', label: 'Rectangle', key: 'r', icon: SHAPE_ICONS.rect },
	{ name: 'ellipse', label: 'Ellipse', key: 'o', icon: SHAPE_ICONS.circle },
	{ name: 'ngon', label: 'Polygon', key: 'n', icon: SHAPE_ICONS.ngon },
	{ name: 'star', label: 'Star', icon: SHAPE_ICONS.star },
	{ name: 'roundRect', label: 'Rounded Rectangle', icon: SHAPE_ICONS.roundRect },
	{ name: 'superellipse', label: 'Superellipse', icon: SHAPE_ICONS.superellipse },
	{ name: 'capsule', label: 'Capsule', icon: SHAPE_ICONS.capsule },
	{ name: 'fan', label: 'Fan', icon: SHAPE_ICONS.fan },
	{ name: 'spiral', label: 'Spiral', icon: SHAPE_ICONS.spiral },
	{ name: 'clothoid', label: 'Clothoid', icon: SHAPE_ICONS.clothoid },
	{ name: 'spray', label: 'Spray', icon: 'ph:spray-bottle' },
	{ name: 'arcStrip', label: 'Arc Strip', icon: 'ph:wave-sine' },
	{ name: 'triangleStrip', label: 'Triangle Strip', icon: 'ph:triangle' },
	{ name: 'radial', label: 'Radial Lines', icon: 'ph:asterisk' },
	{ name: 'dubins', label: 'Dubins Path', icon: 'ph:path' },
] as const
const tool = ref<(typeof TOOLS)[number]['name']>('select')

/** What is on the bar at first: the rest is there behind its dots, until it is wanted. */
const FIRST_TOOLS: FirstTools = {
	shown: ['select', 'artboard', 'points', 'pen', 'pencil', 'rect', 'ellipse', 'ngon'],
	stowed: [
		'star',
		'roundRect',
		'superellipse',
		'capsule',
		'fan',
		'spiral',
		'clothoid',
		'spray',
		'arcStrip',
		'triangleStrip',
		'radial',
		'dubins',
	],
}
const toolsKept = useAppConfigStore().ref<unknown>('glisp.canvas.tools', null)
const toolArrangement = computed(() => arrangedTools(toolsKept.value, FIRST_TOOLS))
const drawing = computed(() => (tool.value === 'select' || tool.value === 'points' ? null : tool.value))

/** What tools make things from, which stays with the app whatever the program is. */
const toolSource = useAppConfigStore().ref<string | null>('glisp.canvas.tool.attributes', null)
const toolDocument = useGlispDocument(loadedSource(toolSource.value), { env: withGraphics })
watch(toolDocument.root, root => (toolSource.value = sourceOfAttributes(root)))
const toolAttributes = computed(() => ({
	paint: paintOfAttributes(toolDocument.root.value, toolDocument.env.value),
	shape: shapeAttributesOf(toolDocument.root.value, toolDocument.env.value),
}))
const toolPanelOpen = useAppConfigStore().ref('glisp.canvas.tool.open', true)
const PROJECT_PANEL = 'glisp.canvas.project'
const CODE_PANEL = 'glisp.canvas.code'
const INSPECTOR_PANEL = 'glisp.canvas.inspector'
/** Where the panels are, which they go by, and which is kept across reloads. */
const $stage = useTemplateRef<HTMLElement>('$stage')
const panels = usePanelLayout($stage, 'glisp.canvas.panels', [
	{
		groups: [{ tabs: [PROJECT_PANEL, CODE_PANEL], active: PROJECT_PANEL }],
		side: 'left',
		inset: 0,
		along: 0,
		full: false,
	},
	{ groups: [alone(INSPECTOR_PANEL)], side: 'right', inset: 0, along: 0, full: false },
	{ groups: [alone('glisp.canvas.tool')], side: 'left', inset: 0, along: 'end', full: false },
	{ groups: [alone(barPanel(MAIN_BAR))], side: 'bottom', inset: 0, along: 'middle', full: false },
], () => {
	// The other bars, of tools taken off of one, are panels too, which go where they were let go of.
	const stage = $stage.value
	const [width, height] = [stage?.clientWidth ?? 1000, stage?.clientHeight ?? 800]
	return new Map(
		toolArrangement.value.bars.flatMap(({ id, x, y }): [string, Place][] =>
			id === MAIN_BAR ? [] : [[barPanel(id), { side: x < 0.5 ? 'left' : 'right', inset: Math.round(Math.max(1, (x < 0.5 ? x : 1 - x) * width - 24)), along: Math.round(Math.max(0, y * height - 24)) }]]
		)
	)
})
provide(PANEL_DOCK, panels)
const panelJoining = panels.joining
const toolInHand = computed(() => TOOLS.find(({ name }) => name === tool.value)!)

/** A drag says its numbers exactly, and they can be typed once it is let go of. */
const dimensionsOn = useAppConfigStore().ref('glisp.canvas.dimensions', false)

/** A drag or a drawing goes to what it comes near. */
const snappingOn = useAppConfigStore().ref('glisp.canvas.snapping', true)

/** What is laid over the canvas to see by, as the program says. */
const toggleAxes = (): void => {
	const root = document.root.value
	if (root instanceof LetAST) setProgram(withAxesToggled(root, document.env.value))
}
const toggleGraphPaper = (kind: 'dots' | 'lines'): void => {
	const root = document.root.value
	if (root instanceof LetAST) setProgram(withGraphPaperToggled(root, document.env.value, kind))
}

const toolKeys = new Set<string>(TOOLS.flatMap(tool => ('key' in tool ? [tool.key] : [])))

/** In a drawing app these are tools, before what they mean to a row in the tree. */
const isToolKey = (event: KeyboardEvent): boolean =>
	!event.metaKey &&
	!event.ctrlKey &&
	!event.altKey &&
	!event.shiftKey &&
	toolKeys.has(event.key.toLowerCase())

/** The tools as the bar shows them, saying the keys that their actions have. */
const toolsOnBar = computed(() =>
	TOOLS.map(({ name, label, icon }) => ({
		name,
		icon,
		tooltip: { content: label, shortcut: actions.shortcutOf(`tool_${name}`) },
	}))
)

/** The project floats over the canvas, or is out of the way as a tab, across reloads. */
const projectOpen = useAppConfigStore().ref('glisp.canvas.project.open', true)

const PROJECT_WIDTH = 280
const ORIGIN_MARGIN = 32
/** The top left of what the project leaves showing, and a little in from there. */
const projectWidth = useAppConfigStore().ref('glisp.canvas.project.width', PROJECT_WIDTH)
const TAB_WIDTH = 32
const origin = [
	(projectOpen.value ? projectWidth.value : TAB_WIDTH) + ORIGIN_MARGIN,
	ORIGIN_MARGIN,
] as const

/** Code goes by the room it is given, rather than by how much of it there is. */
const CODE_HEIGHT = 480
const codeOpen = useAppConfigStore().ref('glisp.canvas.code.open', projectOpen.value)
const inspectorOpen = useAppConfigStore().ref('glisp.canvas.inspector.open', true)

const programOf = (root: { kind: string }): LetAST | null =>
	root instanceof LetAST ? root : null

/** What is in a file as a program, and whether saving could go back to it. */
function readFile(text: string): { readonly root: LetAST; readonly whole: boolean } | null {
	try {
		const reading = programInFile(text)
		const root = reading && programOf(parse(fromBefore(reading.source)))
		return reading && root ? { root, whole: reading.whole } : null
	} catch {
		return null
	}
}

const blankProgram = (): LetAST =>
	withLayerAdded(withLayerAdded(new LetAST([[MAIN, new VecAST([])]], null), 'graphPaper1', graphPaperCall('dots')) as LetAST, 'axes1', axesCall(), 0) as LetAST

const files = useFileTabs({
	document,
	readFile,
	writeFile: root => svgOfProgram(root, document.env.value),
	sourceOf: sourceOfProgram,
	blank: blankProgram,
	view: {
		get: () => $canvas.value?.view(),
		set: view => $canvas.value?.jumpTo(view),
	},
	// A file is seen all of, the first time, and it has nothing selected in it either way.
	onSwitched(firstTime) {
		selectOnCanvas([])
		if (firstTime) fit()
	},
})

// A file opened with this app, from outside of it.
const launching = window as unknown as {
	launchQueue?: {
		setConsumer(consumer: (params: { files: FileSystemFileHandle[] }) => void): void
	}
}
launching.launchQueue?.setConsumer(async ({ files: [handle] }) => {
	if (!handle) return
	const file = await handle.getFile()
	await files.openFrom({ text: await file.text(), name: file.name, handle })
})

/** What a file being pulled in would do, where it is now: be added to what is drawn, or open by itself. */
const fileDrop = ref<'canvas' | 'window' | null>(null)
const carriesFile = (event: DragEvent): boolean => event.dataTransfer?.types.includes('Files') === true
const isReadable = ({ name }: File): boolean => /\.(svg|glisp)$/i.test(name)

useEventListener(window, 'dragover', (event: DragEvent) => {
	if (!carriesFile(event)) return
	// Or else the browser would go to the file, and away from this.
	event.preventDefault()
	fileDrop.value = $canvas.value?.isAt(event.clientX, event.clientY) ? 'canvas' : 'window'
})
useEventListener(window, 'dragleave', (event: DragEvent) => {
	if (event.relatedTarget === null) fileDrop.value = null
})
useEventListener(window, 'drop', (event: DragEvent) => {
	if (!carriesFile(event)) return
	event.preventDefault()
	fileDrop.value = null
	const { clientX, clientY } = event
	const onCanvas = $canvas.value?.isAt(clientX, clientY) === true
	// Only while it is being dropped can any of this be asked.
	const dropped = [...(event.dataTransfer?.items ?? [])].flatMap(item => {
		const file = item.kind === 'file' ? item.getAsFile() : null
		if (file === null || !isReadable(file)) return []
		const asked = item as DataTransferItem & { getAsFileSystemHandle?(): Promise<FileSystemHandle | null> }
		return [{ file, handle: onCanvas ? null : asked.getAsFileSystemHandle?.() }]
	})
	void (async () => {
		if (onCanvas) {
			const place = $canvas.value?.placeAt(clientX, clientY)
			if (place !== undefined) await addFiles(dropped.map(({ file }) => file), place)
			return
		}
		for (const { file, handle } of dropped) {
			const opened = await handle?.catch(() => null)
			await files.openFrom({
				text: await file.text(),
				name: file.name,
				handle: opened?.kind === 'file' ? (opened as FileSystemFileHandle) : null,
			})
		}
	})()
})

/** Files, as one more thing each in what is drawn, at a place. It is all one edit. */
async function addFiles(dropped: readonly File[], place: Vec): Promise<void> {
	const texts = await Promise.all(dropped.map(file => file.text()))
	let root = programOf(document.root.value)
	const rows: string[] = []
	dropped.forEach((file, i) => {
		const reading = readFile(texts[i]!)
		const added = root && reading && withFileDropped(root, document.env.value, reading.root, file.name, place)
		if (!added) return
		root = added.ast
		rows.push(added.row)
	})
	if (rows.length > 0) setProgram(root, rows)
}

function setProgram(next: LetAST | null, rows?: readonly string[]): void {
	if (next === null) return
	document.setRoot(next)
	if (rows) selectOnCanvas(rows)
}

function arrange(how: Arrange): void {
	const root = programOf(document.root.value)
	if (root) setProgram(arranged(root, selected.value, how))
}

/** There being a solid, with what chooses its color to hand. */
function setSolid(): void {
	const root = programOf(document.root.value)
	if (root === null) return
	const { ast, row } = withSolid(root, document.env.value, theme.colorBackground)
	setProgram(ast, [row])
	panels.show(INSPECTOR_PANEL)
}

function group(): void {
	const root = programOf(document.root.value)
	const result = root && grouped(root, document.env.value, selected.value)
	if (result) setProgram(result.ast, [result.row])
}

function ungroup(): void {
	const root = programOf(document.root.value)
	const result = root && ungrouped(root, document.env.value, selected.value)
	if (result) setProgram(result.ast, result.rows)
}

const FIT_MARGIN = 32

/** What is free of the panels that are open. */
function freeArea(): Area {
	const [width, height] = $canvas.value?.size() ?? [0, 0]
	const [left, right, top, bottom] = (['left', 'right', 'top', 'bottom'] as const).map(side => panels.taken(side))
	return [left! + FIT_MARGIN, top! + FIT_MARGIN, width - right! - FIT_MARGIN, height - bottom! - FIT_MARGIN]
}

function fit(rows?: readonly string[]): void {
	const box = boundsOfRows(document.root.value, document.env.value, rows)
	if (box) $canvas.value?.glideTo(viewToFit(box, freeArea()) as unknown as mat2d)
}

const ZOOM_STEP = 1.5
/** The editor is there once it has been asked for, and stays, with what is written in it. */
const codeOpened = ref(false)
watchEffect(() => {
	if (panels.isShown(CODE_PANEL)) codeOpened.value = true
})
const codeHasProblem = ref(false)

function showCode(): void {
	panels.show(CODE_PANEL)
}

const selected = ref<readonly string[]>([])
/** The row that a handle was clicked on, whose part that is what is selected. */
const keptRow = ref<string | null>(null)
/** The rows gone through to the one gone into, as a double click does, outside of which all is faint. */
const isolation = ref<readonly string[]>([])
const isolated = computed(() => isolation.value.at(-1) ?? null)
/**
 * The shape that a part of it picked in the inspector is in, which the inspector stays about,
 * while that part is what is selected on the canvas, with its handles.
 */
const heldInInspector = ref<string | null>(null)
/** What the inspector is about: the whole of a shape, with a part picked out of it. */
const about = computed(() => rowsAbout(selected.value, keptRow.value ?? heldInInspector.value))
/** What is picked out in the inspector of what it is about. */
const pickedOut = computed(() => (about.value === selected.value ? [] : selected.value))
/** How the one thing selected is painted, for a tool to take that, if one thing is. */
const paintOfSelected = computed(() =>
	paintable.value.length === 1 ? paintAt(document.root.value, document.env.value, paintable.value[0]!) : null
)
const paintable = computed(() =>
	about.value.flatMap(row => rowsPaintedBy(document.root.value, document.env.value, row)).filter(row => {
		const [root, env] = [document.root.value, document.env.value]
		// What holds many, each with a color of its own, has nothing to say of them as one.
		if (Array.isArray(valueOfRow(root, env, row))) return false
		// Only a path has a fill or a line, whether it is a row of its own or a part of one: a number
		// has none, however it is bound.
		return !isOfCanvasAt(root, env, row) && pathOfRow(root, env, row) !== null
	})
)

// A solid goes up through the title bar, and the window's own where it has one.
const solid = computed(() => solidOf(document.root.value, document.env.value))
const titleBarStyle = computed(() =>
	solid.value === null
		? undefined
		: { '--tq-titlebar-background': solid.value, color: inkOn(solid.value) }
)
// After the theme, which writes its own background here whenever it changes.
const themeColorMeta = window.document.querySelector('meta[name="theme-color"]')
watchEffect(
	() => themeColorMeta?.setAttribute('content', solid.value ?? theme.colorBackground),
	{ flush: 'post' }
)

const $code = useTemplateRef<{ format(): void }>('$code')
const $editor = useTemplateRef<{
	reveal(path: string): void
	deselect(): void
	copy(): void
	cut(): void
	remove(): void
	paste(written: string): void
	duplicate(text: string): void
}>('$editor')
const $canvas = useTemplateRef<{
	isAt(clientX: number, clientY: number): boolean
	placeAt(clientX: number, clientY: number): Vec
	glideTo(next: mat2d): void
	zoomBy(factor: number): void
	zoomTo(zoom: number): void
	zoom(): number
	view(): mat2d
	jumpTo(next: mat2d): void
	rowAtPoint(x: number, y: number): string | null
	leaveIsolated(): void
	size(): readonly [number, number]
}>('$canvas')
const zoom = computed(() => $canvas.value?.zoom() ?? 1)
/** Once it has been said, the keys are for the canvas again. */
const leaveZoomField = (): void => (window.document.activeElement as HTMLElement | null)?.blur()
const asPercent = scaledBy(100)
const MIN_ZOOM = 0.01
const zoomPresets = computed<MenuItem[]>(() => [
	...[0.5, 1, 2].map(zoom => ({
		label: `${zoom * 100}%`,
		perform: () => $canvas.value?.zoomTo(zoom),
	})),
	{ separator: true },
	{ label: 'Fit All', icon: 'mdi:fit-to-screen-outline', bindIcon: ['⇧', '1'], perform: () => fit() },
	...(selected.value.length === 0
		? []
		: [
				{
					label: 'Fit Selection',
					icon: 'mdi:selection-search',
					bindIcon: ['⇧', '2'],
					perform: () => fit(selected.value),
				},
			]),
])

// Going by what is selected, from anywhere, to what is outside of it is leaving it, and so is
// its no longer being there to be in.
watch(about, rows => {
	const at = isolated.value
	if (at !== null && rows.some(row => !isWithin(row, at))) isolation.value = []
})
watch(
	() => document.root.value,
	root => {
		const at = isolated.value
		if (at !== null && !canIsolate(root, document.env.value, at)) isolation.value = []
	}
)

const crumbs = computed(() => crumbsOf(document.root.value, document.env.value, isolation.value))

/** Back out to a level, with what was gone into from there being what is selected. */
function goToCrumb(index: number): void {
	const crumb = crumbs.value[index]
	const next = crumbs.value[index + 1]
	if (crumb === undefined || next === undefined) return
	isolation.value = crumb.through
	selectOnCanvas([next.row])
}

function backOneLevel(): void {
	if (crumbs.value.length > 1) goToCrumb(crumbs.value.length - 2)
	else $canvas.value?.leaveIsolated()
}

/** Goes into a row, as a double click does on the canvas. */
function isolateRow(row: string): void {
	const [root, env] = [document.root.value, document.env.value]
	const dive = diveAt(root, env, row, rowsPaintedBy(root, env, row)[0], [])
	if (dive === null || dive.isolated === null) return
	isolation.value = [...new Set([...isolation.value, row, dive.isolated])]
	selectOnCanvas(dive.rows)
}

function selectOnCanvas(rows: readonly string[]): void {
	selected.value = rows
	const [first] = rows
	if (first === undefined) $editor.value?.deselect()
	else $editor.value?.reveal(first)
}

/** What the inspector shows: one row, as several have nothing in common to show. */
const inspected = computed(() =>
	about.value.length === 1 ? insideOf(about.value[0]!) : null
)
/** What is there to inspect of a row, past the style it is only given. */
const insideOf = (row: string): string =>
	paintedRow(document.root.value, document.env.value, row)
const insideRows = computed(() => about.value.map(insideOf))
/** What the row selected is called, as what it is called is the row, not what is in it. */
const selectedName = computed(() => {
	const [row] = about.value
	return row === undefined
		? null
		: (inspectionOf(document.root.value, document.env.value, row)?.name ?? null)
})

const renamed = (row: string, name: string) =>
	renameBindingAt(document.root.value, document.env.value, row, name)

function renameRow(row: string, name: string): void {
	const next = renamed(row, name)
	if (!(next instanceof LetAST)) return
	// What is gone into is there under its new name, whatever else there is to say of it.
	isolation.value = isolation.value.map(through =>
		isWithin(through, row) ? `${rowCalled(row, name)}${through.slice(row.length)}` : through
	)
	document.setRoot(next)
	if (about.value.includes(row)) {
		const called = rowCalled(row, name)
		if (keptRow.value === row) keptRow.value = called
		selectOnCanvas(
			selected.value.map(it =>
				it === row || it.startsWith(`${row}/`) ? `${called}${it.slice(row.length)}` : it
			)
		)
	}
}

const inspection = computed(() =>
	inspected.value === null
		? null
		: inspectionOf(document.root.value, document.env.value, inspected.value)
)

const actions = useActionsStore()

/** What this was built from, at the end of a menu, to tell which it is that is running. */
const COMMIT: string = import.meta.env.VITE_COMMIT
actions.setMenuExtras('file', [
	{
		label: `Copy Commit ID (${COMMIT})`,
		icon: 'mdi:source-commit',
		perform: () => void navigator.clipboard.writeText(COMMIT),
	},
])

const selection = computed(() =>
	selectedOf(document.root.value, document.env.value, selected.value)
)
/** What a hole can be filled from, when nothing selected fills it. */
const rowsToChoose = computed(() => {
	const root = programOf(document.root.value)
	return root
		? selectedOf(root, document.env.value, layersOf(root).map(name => rowCalled('', name)))
		: []
})
/** The row of a list of rows at a place on the screen, if there is one. */
function listedRowAt(x: number, y: number): Selected | null {
	const row = window.document
		.elementFromPoint(x, y)
		?.closest('.TqParameterTreeItem')
		?.querySelector('.row .row-path')
		?.getAttribute('data-path')
	return row ? selectedRow(row) : null
}
const selectedRow = (row: string): Selected | null =>
	selectedOf(document.root.value, document.env.value, [row])[0] ?? null

/**
 * What can be put around what is selected: what takes all of it, each in turn. One thing is
 * given to it where it is, and several become one row, as there is only one place for it.
 */
const wraps = computed(() => {
	const env = document.env.value
	const chosen = selection.value
	const root = programOf(document.root.value)
	const together = chosen.length > 1
	if (root === null || chosen.length === 0 || (together && !chosen.every(({ isRow }) => isRow))) {
		return []
	}
	const rows = chosen.map(({ row }) => row)
	// What is drawn of a row is what goes in. How it is drawn is not part of what it is given,
	// and goes on to what they become, if that is something drawn.
	const namesOf = (of: readonly string[]) => of.map(row => nameOfRow(row) ?? '')
	const insideOf = (of: readonly string[]) =>
		of.map(row => reach(root, env, paintedRow(root, env, row))?.chain.at(-1)?.ast) as AST[]
	// What they become is called what makes it, and each of them goes on being called what it was, in there.
	const all = (filter: Filter, of: readonly string[]): LetAST | null =>
		combined(
			root,
			env,
			namesOf(of),
			insideOf(of),
			filter,
			call => (filter.fn.returnType === pathType ? withPaintOfRows(root, env, of, call) : call),
			nameMadeBy(root, filter)
		)
	/** The row of what `row` has become, called `name`, if it was called something there. */
	const renamedRow = (row: string, name: string): string =>
		nameOfRow(row) === null ? row : row.replace(/[^/]*$/, `binding:${name}`)
	const firstOf = (of: readonly string[], filter: Filter): string[] => [renamedRow(of[0]!, nameMadeBy(root, filter))]
	return filtersFor(chosen.map(({ value }) => value), env, functionsOfProgram(root, env))
		.filter(({ name }) => !NOT_FILTERS.has(name))
		.flatMap(filter => {
			const item = {
				id: `wrap_${filter.name}`,
				label: filter.label,
				keywords: ['Wrap'],
				tag: 'Wrap',
				icon: iconOfFunction(filter.name) ?? 'mdi:function-variant',
			}
			// What it wants more of is asked for, and it goes with what it takes when that is there.
			if (filter.more.length > 0) {
				return [
					{
						...item,
						params: filter.more.map(param => ({ ...param, asked: true })),
						perform(...picked: readonly Selected[]) {
							const of = [...rows, ...picked.map(({ row }) => row)]
							const next = new Set(of).size === of.length ? all(filter, of) : null
							if (next) setProgram(next, firstOf(of, filter))
						},
					},
				]
			}
			const done = together ? all(filter, rows) : wrappedAt(root, env, paintedRow(root, env, rows[0]!), filter, nameOfRow(rows[0]!))
			if (!(done instanceof LetAST)) return []
			// What is around it now is called what it is.
			const perform = (): void => {
				const renamed = together || nameOfRow(rows[0]!) === null ? null : renameBindingAt(done, env, rows[0]!, nameMadeBy(root, filter))
				if (renamed instanceof LetAST) setProgram(renamed, firstOf(rows, filter))
				else setProgram(done, together ? firstOf(rows, filter) : rows.slice(0, 1))
			}
			return [{ ...item, perform }]
		})
		.sort((a, b) => Number('params' in a) - Number('params' in b))
})

/** The row of what is at a place on the screen, listed or drawn. */
function rowOnScreenAt(x: number, y: number): Selected | null {
	const drawn = $canvas.value?.rowAtPoint(x, y)
	return listedRowAt(x, y) ?? (drawn ? selectedRow(drawn) : null)
}

actions.provideContext({
	types: actionTypesOver({
		rows: () => rowsToChoose.value,
		at: rowOnScreenAt,
		from: rowOnScreenAt,
	}),
	subject: () => selection.value,
	suggestions: () => {
		const items = wraps.value
		return items.length === 0 ? null : { heading: 'Wrap', items }
	},
})

// What a form asks for is pointed at, which a tool for drawing would take for drawing.
watch(
	() => actions.form,
	form => {
		if (form) tool.value = 'select'
	}
)

/** Of what is selected, or with nothing selected, of what the tools draw with. */
function swapPaints(): void {
	const [painted, rows] = selected.value.length > 0 ? [document, paintable.value] : [toolDocument, [PAINT_ROW]]
	const next = withPaintsSwapped(painted.root.value, painted.env.value, rows)
	if (next.kind === 'let' && next !== painted.root.value) painted.setRoot(next)
}

/** Does `act` to the rows it was given, which are then what is selected, if they were not. */
const onRows =
	(act: () => unknown) =>
	async (chosen: readonly Selected[]): Promise<void> => {
		const rows = chosen.map(({ row }) => row)
		if (rows.join() !== selected.value.join()) {
			selectOnCanvas(rows)
			await nextTick()
		}
		act()
	}

// In the code, what the cursor is in is what is selected, and these are not anything being typed.
useEventListener(
	window,
	'keydown',
	(event: KeyboardEvent) => {
		const command = slotCommandOfKey(event)
		if (command !== 'step' && command !== 'all') return
		// On a Mac, Control+E goes to the end of the line, in anything that is typed in.
		if (/mac|ipod|iphone|ipad/i.test(navigator.userAgent) && !event.metaKey) return
		if (!(event.target as Element | null)?.closest?.('.AstProgramCode')) return
		event.preventDefault()
		event.stopPropagation()
		// A cursor in a number has nothing to step, and is in what does.
		const before = document.root.value
		for (const row of selected.value) {
			const parts = row.split('/')
			for (let upTo = parts.length; upTo > 0; upTo--) {
				const next = withSlotCommand(before, document.env.value, [parts.slice(0, upTo).join('/')], command)
				if (next === null || print(next) === print(before)) continue
				document.setRoot(next as LetAST)
				return
			}
		}
	},
	{ capture: true }
)

/** What takes all that is selected, whatever it is. */
const rowsParam = { name: 'rows', type: rowType, many: true }

/**
 * One of what can be done to a slot, as an action. It goes by the rows it is given, which may
 * be parts of rows, and not by what is selected. A key that is a tool's does not do this.
 */
function slotAction(command: SlotCommand) {
	const { label, icon, ...rest } = SLOT_COMMANDS[command]
	const keys = 'keys' in rest ? rest.keys : undefined
	const isTool = keys?.length === 1 && toolKeys.has(keys[0].toLowerCase())
	const root = () => document.root.value
	return {
		id: `slot_${command}`,
		label,
		icon,
		...(keys && !isTool ? { hint: [...keys] } : {}),
		params: [{ name: 'rows', type: slotTypes[command], many: true }],
		describe(chosen: readonly Selected[]) {
			const here = chosen[0] && slotCommandAt(root(), document.env.value, chosen[0].row, command)
			return here ? { label: here.label, icon: here.icon } : null
		},
		perform(chosen: readonly Selected[]) {
			const rows = chosen.map(({ row }) => row)
			if (command === 'copy') {
				const text = copiedBySlotCommand(root(), document.env.value, rows, command)
				void navigator.clipboard.writeText(text)
				return
			}
			const next = withSlotCommand(root(), document.env.value, rows, command)
			if (next instanceof LetAST) setProgram(next, command === 'delete' ? [] : undefined)
		},
	}
}

/** What was last known of where the pointer is, for what comes up there. */
let pointerAt: [number, number] | null = null
useEventListener(window, 'pointermove', (event: PointerEvent) => {
	pointerAt = [event.clientX, event.clientY]
}, { passive: true, capture: true })

/** Where what is searched for by Tab comes up, while it is up. */
const quickAddAt = ref<readonly [number, number] | null>(null)
/** The parameter picked out in the inspector, which is what a Tab is about, if there is one. */
const inspectorRow = ref<string | null>(null)
/** Where what is searched for goes, if it goes in a value, and is not added to what is drawn. */
const quickFillAt = ref<string | null>(null)
// Going to the canvas is leaving what was picked out there.
useEventListener(window, 'pointerdown', (event: PointerEvent) => {
	if ((event.target as HTMLElement | null)?.closest?.('.canvas')) inspectorRow.value = null
}, { capture: true })
/** Where that was asked for in what is drawn, which is where a shape goes. */
const quickAddPlace = shallowRef<Vec>([0, 0])

/**
 * A row picked in the inspector that is a path a shape is made from is what is selected on the
 * canvas, with its own handles, while the inspector stays about the shape. Another row picked
 * there goes back to all of the shape.
 */
function pickInInspector(row: string | null): void {
	inspectorRow.value = row
	const [whole, other] = about.value
	const [root, env] = [document.root.value, document.env.value]
	if (row !== null && whole !== undefined && other === undefined && row.startsWith(`${whole}/`)) {
		if (pathOfRow(root, env, row) !== null) {
			heldInInspector.value = whole
			keptRow.value = null
		} else {
			// Any other parameter is picked out of the shape, which keeps its handles, as pressing
			// the handle for it does, for that one to say so.
			heldInInspector.value = null
			keptRow.value = whole
			keptByInspector = true
		}
		selected.value = [row]
		return
	}
	const back = heldInInspector.value ?? (keptByInspector ? keptRow.value : null)
	if (back !== null && pickedOut.value.length > 0) selected.value = [back]
	heldInInspector.value = null
	keptByInspector = false
}
/** Whether what is picked out of the shape kept was picked in the inspector, to go back from there. */
let keptByInspector = false
// Anything else selected, from anywhere, is not the shape that was held any more.
watch(selected, rows => {
	const held = heldInInspector.value
	if (held !== null && !rows.every(row => row.startsWith(`${held}/`))) heldInInspector.value = null
})

// Deleting a path that a shape is made from leaves nothing there, rather than taking the shape.
useHostDelete(() => {
	if (heldInInspector.value === null || pickedOut.value.length === 0) return false
	const next = withBlanks(document.root.value, document.env.value, pickedOut.value)
	if (next instanceof LetAST) setProgram(next)
	return true
})

/** Something chosen for where nothing is, from among what fits there, coming up by it. */
function fillBlank(path: string, from: Element): void {
	const { left, bottom } = from.getBoundingClientRect()
	// A shape goes in the middle of what is seen, there being nowhere on the canvas that was pointed at.
	quickAddPlace.value = $canvas.value?.placeAt(window.innerWidth / 2, window.innerHeight / 2) ?? [0, 0]
	quickFillAt.value = path
	fillingBlank.value = true
	quickAddAt.value = [left, bottom + 4]
}
/** Whether what is being filled is where nothing is, which has nothing to wrap. */
const fillingBlank = ref(false)
watch(quickAddAt, at => {
	if (at === null) fillingBlank.value = false
})

useEventListener(window, 'keydown', (event: KeyboardEvent) => {
	if (event.key !== 'Tab' || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return
	if (event.defaultPrevented || quickAddAt.value !== null) return
	const target = event.target as HTMLElement | null
	if (target?.closest?.('input, textarea, select, [contenteditable]')) return
	event.preventDefault()
	const middle: [number, number] = [window.innerWidth / 2, window.innerHeight / 2]
	const at: [number, number] = pointerAt ?? middle
	// What is drawn is added to, a guide too. A value on its own, however it is selected, wants another.
	const [only, other] = selection.value
	const isValue =
		only !== undefined &&
		other === undefined &&
		!drawingType.fits(only.value) &&
		!drawsAt(document.root.value, document.env.value, only.row)
	quickFillAt.value = inspectorRow.value ?? (isValue ? only.row : null)
	// A shape goes where it is pointed at on the canvas, or else in the middle of what is seen: what
	// fills a place is not pointed at anywhere, and a panel the pointer is over would only hide it.
	const pointed = quickFillAt.value === null && pointerAt !== null && ($canvas.value?.isAt(at[0], at[1]) ?? false)
	const placed = pointed ? at : middle
	quickAddPlace.value = $canvas.value?.placeAt(placed[0], placed[1]) ?? [0, 0]
	quickAddAt.value = at
})

/** What takes what is selected, and then all there is to add, as what can be searched for. */
const quickAddItems = computed<readonly QuickAddItem[]>(() => {
	if (quickAddAt.value === null) return []
	const filling = quickFillAt.value
	const program = programOf(document.root.value)
	if (filling !== null) {
		return program === null
			? []
			: fillersAt(program, document.env.value, filling)
					.filter(filler => !fillingBlank.value || filler.group !== 'Wrap')
					.map(filler => ({
					id: `fill_${filler.value ? 'value_' : ''}${filler.name}`,
					name: filler.name,
					label: filler.label,
					group: filler.group,
					icon: filler.value ? 'mdi:at' : (iconOfFunction(filler.name) ?? 'mdi:function-variant'),
					action: filler.group === 'Wrap' ? ('wrap' as const) : ('replace' as const),
					perform() {
						const next = withFilled(program, document.env.value, filling, filler, quickAddPlace.value)
						if (next instanceof LetAST) setProgram(next)
					},
				}))
	}
	const env = document.env.value
	const root = program
	const addable = root === null ? [] : addablesIn(root, env)
	const drawn = new Set(addable.filter(({ alone }) => !alone).map(({ name }) => name))
	const taken = wraps.value.filter(({ id }) => drawn.has(id.slice('wrap_'.length))).map(item => ({
		id: item.id,
		name: item.id.slice('wrap_'.length),
		label: item.label,
		group: 'Selected',
		icon: item.icon,
		action: 'wrap' as const,
		// Whatever it would want more of goes by what it starts as, with nothing asked for here.
		perform: item.perform as () => void,
	}))
	const already = new Set(taken.map(({ name }) => name))
	return [
		...taken,
		...addable
			.filter(({ name }) => !already.has(name))
			.map(({ name, label, group, quiet }) => ({
				id: `add_${name}`,
				name,
				label,
				group,
				...(quiet ? { quiet } : {}),
				icon: iconOfFunction(name) ?? 'mdi:function-variant',
				perform() {
					const added = root && withAdded(root, env, name, quickAddPlace.value, selected.value)
					if (!added) return
					tool.value = 'select'
					setProgram(withPaintAdded(added.ast, env, added.row, toolAttributes.value.paint), [added.row])
				},
			})),
	]
})

// What a handle picked out of a row is what a key is about, rather than all of the row.
useEventListener(
	window,
	'keydown',
	(event: KeyboardEvent) => {
		const command = slotCommandOfKey(event)
		if (command === null || pickedOut.value.length === 0 || event.defaultPrevented) return
		const target = event.target as HTMLElement | null
		if (target?.closest?.('input, textarea, [contenteditable], .monaco-editor')) return
		event.stopPropagation()
		event.preventDefault()
		const next = withSlotCommand(document.root.value, document.env.value, pickedOut.value, command)
		if (next instanceof LetAST) setProgram(next)
	},
	{ capture: true }
)

/** The same for each row of what is selected, of which there can be very many to list it for. */
const selectionMenu = computed(() => actions.menuFor(selection.value))

/** What can be done to the slot at `path`, or to all that is selected, if it is among that. */
function commandsFor(path: string): MenuItem[] {
	if (selected.value.includes(path)) return selectionMenu.value
	return actions.menuFor(selectedOf(document.root.value, document.env.value, [path]))
}

const canvasMenu = ref<readonly [number, number] | null>(null)
const canvasMenuItems = computed(() => (canvasMenu.value === null ? [] : selectionMenu.value))

/** A right click is on what is under it, along with what it is selected with. */
function openCanvasMenu(x: number, y: number, row: string | null): void {
	if (row === null) return
	if (!selected.value.includes(row)) selectOnCanvas([row])
	canvasMenu.value = [x, y]
}

actions.register([
	{
		id: 'file',
		order: 10,
		icon: 'mdi:file-outline',
		children: [
			{
				id: 'file_new',
				label: 'New',
				icon: 'mdi:file-plus-outline',
				perform() {
					void files.add()
				},
			},
			{
				id: 'file_new_sketch',
				label: 'New Sketch',
				icon: 'mdi:file-document-edit-outline',
				perform() {
					void files.add(parse(NEW_SKETCH) as LetAST)
				},
			},
			{ id: 'file_open', label: 'Open...', icon: 'mdi:folder-open-outline', bind: 'command+o', perform: () => files.open() },
			{ id: 'file_save', label: 'Save', icon: 'mdi:content-save-outline', bind: 'command+s', perform: () => files.save(false) },
			{ id: 'file_save_as', label: 'Save As...', icon: 'mdi:content-save-edit-outline', bind: 'command+shift+s', perform: () => files.save(true) },
			{
				id: 'file_export_svg',
				label: 'Export Selection or Artboard...',
				icon: 'mdi:export-variant',
				// All of a program is what saving it writes. This is what is drawn, or an area, or
				// both: that much of those, and an area on its own is that much of everything.
				params: [{ name: 'what', type: exportableType, many: true }],
				perform(chosen: readonly Selected[]) {
					const root = document.root.value
					const env = document.env.value
					// An artboard is exported as large as it is, as an area would be, with what is on it.
					const area =
						(chosen.find(({ value }) => isRect(value))?.value as RectValue | undefined) ??
						(chosen.find(({ value }) => isArtboard(value))?.value as ArtboardValue | undefined)?.area
					const drawings = chosen.filter(({ value }) => !isRect(value)).map(({ row }) => row)
					const svg = svgOfRows(root, env, exportedRows(root, env, drawings), area)
					if (svg !== null) void exportSvg(svg, files.activeTab.value?.name ?? 'sketch')
				},
			},
		],
	},
	{
		id: 'edit',
		order: 20,
		icon: 'mdi:pencil-outline',
		children: [
			{
				id: 'edit_format_code',
				label: 'Format Code',
				icon: 'mdi:format-align-left',
				hint: ['⌘', '⇧', 'F'],
				perform: async () => {
					// What is open for one thing to be written is what it is about, and nothing else.
					if (formatOneExpression()) return
					showCode()
					await nextTick()
					$code.value?.format()
				},
			},
			{ id: 'edit_undo', label: 'Undo', icon: 'mdi:undo', perform: () => document.undo() },
			{ id: 'edit_redo', label: 'Redo', icon: 'mdi:redo', perform: () => document.redo() },
			{ id: 'edit_cut', label: 'Cut', icon: 'mdi:content-cut', params: [rowsParam], perform: onRows(() => $editor.value?.cut()) },
			{ id: 'edit_copy', label: 'Copy', icon: 'mdi:content-copy', params: [rowsParam], perform: onRows(() => $editor.value?.copy()) },
			{
				id: 'edit_copy_value',
				label: SLOT_COMMANDS.value.label,
				icon: SLOT_COMMANDS.value.icon,
				params: [{ name: 'values', type: copyableType, many: true }],
				perform(chosen: readonly Selected[]) {
					const texts = chosen.flatMap(({ row }) => {
						const current = selectedRow(row)
						return (current && valueTextOf(current, document.env.value)) ?? []
					})
					void navigator.clipboard.writeText(texts.join('\n'))
				},
			},
			{
				id: 'edit_paste',
				label: 'Paste',
				icon: 'mdi:content-paste',
				async perform() {
					$editor.value?.paste(await navigator.clipboard.readText())
				},
			},
			{
				id: 'edit_duplicate',
				label: 'Duplicate',
				icon: 'mdi:content-duplicate',
				bind: 'command+d',
				params: [rowsParam],
				perform: onRows(() => {
					const text = copiedRows(document.root.value, document.env.value, selected.value)
					if (text !== '') $editor.value?.duplicate(text)
				}),
			},
			...(['copy', 'delete'] as const).map(slotAction),
			{
				id: 'edit_select_all',
				label: 'Select All',
				icon: 'mdi:select-all',
				bind: 'command+a',
				perform: () => selectOnCanvas(rowsToTake(document.root.value, document.env.value, isolated.value)),
			},
		],
	},
	{
		id: 'object',
		order: 30,
		icon: 'mdi:shape-outline',
		children: [
			{ id: 'object_front', label: 'Bring to Front', icon: 'mdi:arrange-bring-to-front', bind: 'shift+]', params: [rowsParam], perform: onRows(() => arrange('front')) },
			{ id: 'object_forward', label: 'Bring Forward', icon: 'mdi:arrange-bring-forward', bind: ']', params: [rowsParam], perform: onRows(() => arrange('forward')) },
			{ id: 'object_backward', label: 'Send Backward', icon: 'mdi:arrange-send-backward', bind: '[', params: [rowsParam], perform: onRows(() => arrange('backward')) },
			{ id: 'object_back', label: 'Send to Back', icon: 'mdi:arrange-send-to-back', bind: 'shift+[', params: [rowsParam], perform: onRows(() => arrange('back')) },
			...(['step', 'all', 'pin', 'hide'] as const).map(slotAction),
			{ id: 'object_isolate', label: 'Isolate', icon: 'mdi:target', params: [rowsParam], perform: onRows(() => isolateRow(selected.value[0]!)) },
			{ id: 'object_exit_isolation', label: 'Exit Isolation', icon: 'mdi:arrow-collapse-up', perform: () => $canvas.value?.leaveIsolated() },
			{ id: 'object_swap_paint', label: 'Swap Fill and Stroke', icon: 'mdi:swap-horizontal', bind: 'shift+x', perform: swapPaints },
			{ id: 'object_group', label: 'Group', icon: 'mdi:group', bind: 'command+g', params: [rowsParam], perform: onRows(() => group()) },
			{ id: 'object_ungroup', label: 'Ungroup', icon: 'mdi:ungroup', bind: 'command+shift+g', params: [{ name: 'groups', type: ungroupableType, many: true }], perform: onRows(ungroup) },
		],
	},
	{
		id: 'view',
		order: 40,
		icon: 'mdi:eye-outline',
		children: [
			{ id: 'view_fit', label: 'Fit All', icon: 'mdi:fit-to-screen-outline', bind: 'shift+1', perform: () => fit() },
			{ id: 'view_fit_selection', label: 'Fit Selection', icon: 'mdi:selection-search', bind: 'shift+2', params: [rowsParam], perform: onRows(() => fit(selected.value)) },
			{ id: 'view_actual', label: 'Actual Size', icon: 'mdi:numeric-1-box-outline', bind: 'command+0', perform: () => $canvas.value?.zoomTo(1) },
			{
				id: 'view_zoom_to',
				label: 'Zoom To',
				icon: 'mdi:magnify',
				params: [{ name: 'percent', type: numberType, asked: true }],
				perform: (percent: number) => $canvas.value?.zoomTo(percent / 100),
			},
			{ id: 'view_zoom_in', label: 'Zoom In', icon: 'mdi:magnify-plus-outline', bind: 'command+=', perform: () => $canvas.value?.zoomBy(ZOOM_STEP) },
			{ id: 'view_zoom_out', label: 'Zoom Out', icon: 'mdi:magnify-minus-outline', bind: 'command+-', perform: () => $canvas.value?.zoomBy(1 / ZOOM_STEP) },
			{ id: 'view_project', label: 'Toggle Project', icon: 'ph:tree-view', perform: () => panels.toggle(PROJECT_PANEL) },
			{ id: 'view_code', label: 'Toggle Code', icon: 'ph:code', perform: () => panels.toggle(CODE_PANEL) },
			{ id: 'view_inspector', label: 'Toggle Inspector', icon: 'ph:sliders-horizontal', perform: () => panels.toggle(INSPECTOR_PANEL) },
			{ id: 'view_tool', label: 'Toggle Tool Options', icon: 'ph:palette', perform: () => panels.toggle('glisp.canvas.tool') },
			{ id: 'view_dimensions', label: 'Toggle Dimensions', icon: 'ph:ruler', bind: 'd', perform: () => (dimensionsOn.value = !dimensionsOn.value) },
			{ id: 'view_snapping', label: 'Toggle Snapping', icon: 'ph:magnet', bind: 'command+u', perform: () => (snappingOn.value = !snappingOn.value) },
			{ id: 'view_dots', label: 'Toggle Dots', icon: 'ph:dots-nine', perform: () => toggleGraphPaper('dots') },
			{ id: 'view_lines', label: 'Toggle Lines', icon: 'ph:grid-four', perform: () => toggleGraphPaper('lines') },
			{ id: 'view_axes', label: 'Toggle Axes', icon: 'ph:crosshair-simple', perform: toggleAxes },
			{ id: 'view_solid', label: 'Set Solid', icon: 'ph:paint-bucket', perform: setSolid },
		],
	},
	{
		id: 'tool',
		order: 50,
		icon: 'ph:cursor-fill',
		children: TOOLS.map(item => ({
			id: `tool_${item.name}`,
			label: item.label,
			icon: item.icon,
			// Letting go of whatever else is being done is going back to selecting.
			...('key' in item ? { bind: item.name === 'select' ? [item.key, 'esc'] : item.key } : {}),
			perform() {
				tool.value = item.name
			},
		})),
	},
])

/** A click on a row, with what the keys held mean, as they do on a canvas and in a list. */
const $inspector = useTemplateRef<InstanceType<typeof AstEditor>>('$inspector')
/** The value being chosen for, by pointing at a shape on the canvas or in the tree. */
const pickingFor = ref<string | null>(null)
/** Where the list of what can be chosen is, if it is up. */
const pickListAt = ref<readonly [number, number] | null>(null)
const PICK_LIST_WIDTH = 280
const valuePicker = {
	wants: (expected: TypeValue | null) => expected?.typeName === 'path',
	isFor: (path: string) => pickingFor.value === path,
	toggle(path: string, from: Element) {
		const isOff = pickingFor.value === path
		pickingFor.value = isOff ? null : path
		const { left, top } = from.getBoundingClientRect()
		pickListAt.value = isOff ? null : [left - PICK_LIST_WIDTH - 8, top]
	},
}
/** What there is to choose from by name, which it can refer to. */
const pickItems = computed<readonly QuickAddItem[]>(() => {
	const source = pickingFor.value
	if (source === null || pickListAt.value === null) return []
	return sceneOf(document.root.value, document.env.value)
		.filter(({ row, draw }) => isOutlined(draw) && $inspector.value?.canLink(source, row))
		.map(({ row, value }) => ({
			id: row,
			name: '',
			label: nameOfRow(row) ?? row,
			group: 'Shapes',
			icon: iconOfPath(new PathValue(value as Path)) ?? 'ph:path',
			perform: () => picked(row),
		}))
})

/** A row of the project pulled onto what takes one, which is the same as choosing it. */
let dragged: { row: string; x: number; y: number } | null = null
let dropOn: Element | null = null
function setDropOn(target: Element | null): void {
	dropOn?.removeAttribute('data-drop-here')
	dropOn = target
	dropOn?.setAttribute('data-drop-here', '')
}
useEventListener(
	window,
	'pointerdown',
	(event: PointerEvent) => {
		const item = (event.target as Element | null)?.closest?.('[data-panel="glisp.canvas.project"] .TqParameterTreeItem')
		const row = item?.querySelector('.row-path')?.getAttribute('data-path')
		dragged = row == null ? null : { row, x: event.clientX, y: event.clientY }
	},
	{ capture: true }
)
useEventListener(window, 'pointermove', (event: PointerEvent) => {
	if (dragged === null) return
	if (Math.hypot(event.clientX - dragged.x, event.clientY - dragged.y) < 4) return
	setDropOn(window.document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-takes-drop]') ?? null)
})
useEventListener(
	window,
	'pointerup',
	() => {
		const source = dropOn?.getAttribute('data-takes-drop')
		if (source != null && dragged !== null) $inspector.value?.link(source, dragged.row)
		setDropOn(null)
		dragged = null
	},
	{ capture: true }
)
/** It goes on being asked, if that is what it cannot refer to, as what it is in cannot be. */
function picked(row: string): void {
	const source = pickingFor.value
	if (source !== null && $inspector.value?.link(source, row)) {
		pickingFor.value = null
		pickListAt.value = null
	}
}
watch(selected, () => {
	pickingFor.value = null
	pickListAt.value = null
})
useEventListener(window, 'keydown', (event: KeyboardEvent) => {
	if (event.key === 'Escape') pickingFor.value = null
})

function pickInTree(row: string, event: MouseEvent): boolean {
	// A menu is about what is selected, or else about this.
	if (event.type === 'contextmenu') return true
	if (pickingFor.value !== null) {
		picked(row)
		return false
	}
	const how = event.metaKey || event.ctrlKey ? 'toggle' : event.shiftKey ? 'range' : 'only'
	const next = pickedRows(document.root.value, document.env.value, selected.value, row, how)
	selected.value = next
	if (next.includes(row)) return true
	const last = next.at(-1)
	if (last === undefined) $editor.value?.deselect()
	else $editor.value?.reveal(last)
	return false
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
			<TitleBar class="title-bar" name="Glisp Canvas" icon="favicon.svg" :style="titleBarStyle">
				<template #left>
					<FileTabs
						:tabs="files.tabs.value"
						:active="files.active.value"
						@select="files.switchTo"
						@close="files.close"
						@rename="files.rename"
						@move="files.move"
						@add="files.add()"
					/>
				</template>
				<template #right>
					<InputNumber
						class="zoom"
						leftIcon="mdi:magnify"
						:modelValue="zoom"
						:display="asPercent"
						:min="MIN_ZOOM"
						:clampMax="false"
						:precision="0"
						suffix="%"
						:presets="zoomPresets"
						@update:modelValue="$canvas?.zoomTo($event)"
						@confirm="leaveZoomField"
					/>
				</template>
			</TitleBar>
		</template>
		<template #default>
			<div ref="$stage" class="stage">
				<div v-if="fileDrop !== null" class="file-drop" :class="fileDrop">
					<span class="file-drop-says">{{ fileDrop === 'canvas' ? 'Add to this drawing' : 'Open as a new file' }}</span>
				</div>
				<CanvasView
					ref="$canvas"
					class="canvas"
					@pick="picked"
					:document="document"
					:selected="selected"
					:picking="pickingFor !== null"
					:origin="origin"
					:drawing="drawing"
					:byPoints="tool === 'points'"
					:attributes="toolAttributes"
					:dimensions="dimensionsOn"
					:snapping="snappingOn"
					:addingAt="quickAddAt !== null && quickFillAt === null ? quickAddPlace : null"
					v-model:keptRow="keptRow"
					v-model:isolation="isolation"
					@select="selectOnCanvas"
					@menu="openCanvasMenu"
					@attribute="(name, value) => toolDocument.setRoot(withAttribute(toolDocument.root.value, name, value))"
				/>
				<IsolationBar v-if="crumbs.length > 0" :crumbs="crumbs" @back="backOneLevel" @go="goToCrumb" />
				<QuickAdd
					v-if="pickListAt !== null && pickingFor !== null"
					:items="pickItems"
					:at="pickListAt"
					placeholder="Find a shape, or point at one"
					@close="pickListAt = null"
				/>
				<QuickAdd
					v-if="quickAddAt !== null"
					:items="quickAddItems"
					:at="quickAddAt"
					:placeholder="quickFillAt === null ? 'Add…' : fillingBlank ? 'Fill…' : 'Replace or wrap…'"
					@close="quickAddAt = null"
				/>
				<Popover
					v-if="canvasMenu && canvasMenuItems.length > 0"
					:reference="null"
					:placement="canvasMenu"
					:open="true"
					teleport=".TqViewport"
					@update:open="$event || (canvasMenu = null)"
				>
					<Menu :items="canvasMenuItems" @close="canvasMenu = null" />
				</Popover>
				<FloatPanel
					v-model:open="projectOpen"
					:name="PROJECT_PANEL"
					:width="PROJECT_WIDTH"
					label="Project"
					icon="ph:tree-view"
				>
					<div class="tab-content">
						<AstEditor
							ref="$editor"
							:document="document"
							compact
							layers
							:hostKey="isToolKey"
							:commandsFor="commandsFor"
							:iconOfValue="iconOfPath"
							:alsoSelected="about"
							:isolated="isolation"
							:layerRows="row => rowsListedIn(document.root.value, document.env.value, row)"
							:layerLabel="row => labelOfRow(document.root.value, document.env.value, row)"
							:pickRow="pickInTree"
							:copyAs="rows => svgOfRows(document.root.value, document.env.value, rows)"
							:pasteAs="bindingsOfSvg"
							@select="selectInTree"
							@code="showCode"
							@pasted="selectOnCanvas"
							@kept="sayKept"
						/>
					</div>
				</FloatPanel>
				<FloatPanel
					v-model:open="codeOpen"
					:name="CODE_PANEL"
					:width="PROJECT_WIDTH"
					:height="CODE_HEIGHT"
					:alert="codeHasProblem ? 'This cannot be read' : null"
					label="Code"
					icon="ph:code"
				>
					<div v-if="codeOpened" class="tab-content">
						<AstProgramCode
							ref="$code"
							:document="document"
							:selected="selected"
							@problem="codeHasProblem = $event"
							@select="selectOnCanvas"
						/>
					</div>
				</FloatPanel>
				<FloatPanel
					v-model:open="inspectorOpen"
					:name="INSPECTOR_PANEL"
					:width="320"
					data-selects-rows
					label="Inspector"
					icon="ph:sliders-horizontal"
				>
					<template #header>
						<button
							v-if="inspection?.outer && inspected === about[0]"
							v-tooltip="'What holds this'"
							class="outer"
							aria-label="What holds this"
							@click="selectOnCanvas([inspection!.outer!])"
						>
							<Icon icon="ph:arrow-up-left" />
						</button>
						<span class="panel-title">
							<Icon class="panel-icon" icon="ph:sliders-horizontal" />
							<template v-if="inspection">
								<RowName
									:key="about[0]"
									:row="about[0]!"
									:label="selectedName ?? ''"
									:source="nameOfRow(about[0]!)"
									:can="(row, name) => renamed(row, name) !== null"
									@rename="renameRow"
								/>
							</template>
							<template v-else-if="about.length > 1">
								<span class="name">{{ about.length }} selected</span>
							</template>
							<span v-else class="name">Inspector</span>
						</span>
					</template>
					<AstMultiInspector
						v-if="about.length > 1"
						:document="document"
						:rows="insideRows"
						:iconOfFunction="iconOfFunction"
					>
						<PaintControls v-if="paintable.length > 0" :document="document" :rows="paintable" />
					</AstMultiInspector>
					<AstEditor
						v-else
						:document="document"
						:inspect="inspected"
						ref="$inspector"
						:valuePicker="valuePicker"
						:alsoSelected="pickedOut"
						:iconOfValue="iconOfPath"
						:fillBlank="fillBlank"
						@select="pickInInspector"
						@kept="sayKept"
						:copyAs="rows => svgOfRows(document.root.value, document.env.value, rows)"
						:pasteAs="bindingsOfSvg"
						:iconOfFunction="iconOfFunction"
					>
						<p v-if="selected.length === 0" class="nothing-selected">Nothing selected</p>
						<PaintControls v-if="paintable.length > 0" :document="document" :rows="paintable" />
					</AstEditor>
				</FloatPanel>
				<ToolPanel
					v-model:open="toolPanelOpen"
					:document="toolDocument"
					:tool="tool"
					:label="tool === 'select' || tool === 'points' ? 'Tool Options' : toolInHand.label"
					:icon="toolInHand.icon"
					:paintOfSelected="paintOfSelected"
				/>
				<div
					v-if="panelJoining"
					class="panel-joining"
					:class="[panelJoining.kind, { across: panelJoining.kind === 'stack' && panelJoining.width === 0 }]"
					:style="{
						left: `${panelJoining.left}px`,
						top: `${panelJoining.top}px`,
						width: panelJoining.width === 0 ? undefined : `${panelJoining.width}px`,
						height: panelJoining.height === 0 ? undefined : `${panelJoining.height}px`,
					}"
				/>
				<ToolBar
					:tools="toolsOnBar"
					:active="tool"
					:arrangement="toolArrangement"
					@select="tool = $event as typeof tool"
					@update:arrangement="toolsKept = $event"
				>
					<span class="tools-divider" />
					<button
						v-tooltip="{ content: 'Dimensions', shortcut: actions.shortcutOf('view_dimensions') }"
						class="tool"
						:class="{ active: dimensionsOn }"
						aria-label="Dimensions"
						:aria-pressed="dimensionsOn"
						@click="dimensionsOn = !dimensionsOn"
					>
						<Icon icon="ph:ruler" />
					</button>
					<button
						v-tooltip="{ content: 'Snapping', shortcut: actions.shortcutOf('view_snapping') }"
						class="tool"
						:class="{ active: snappingOn }"
						aria-label="Snapping"
						:aria-pressed="snappingOn"
						@click="snappingOn = !snappingOn"
					>
						<Icon icon="ph:magnet" />
					</button>
				</ToolBar>
			</div>
		</template>
	</TqApp>
</template>

<style scoped>
/* Over all of it, and in the way of nothing, as what is under it is what says where it goes. */
.file-drop {
	position: fixed;
	inset: 0;
	z-index: 1000;
	display: flex;
	align-items: flex-end;
	justify-content: center;
	padding-bottom: 96px;
	pointer-events: none;
	box-shadow: inset 0 0 0 3px var(--tq-color-accent);
}
.file-drop.window {
	background: color-mix(in srgb, var(--tq-color-accent) 12%, transparent);
}
.file-drop-says {
	padding: 6px 12px;
	border-radius: var(--tq-radius-input);
	background: var(--tq-color-accent);
	color: var(--tq-color-on-accent);
}
/* The tabs go from the name of the app up to the zoom, so there is no middle to keep clear. */
.title-bar.title-bar {
	grid-template-columns: minmax(0, 1fr) 0 min-content;
}
.title-bar.title-bar :deep(.left) {
	min-width: 0;
}
.zoom {
	width: 6em;
}

.stage {
	position: relative;
	height: 100%;
}
/* The canvas goes on up under the title bar, and only the canvas: panels stay below it. */
.stage .canvas {
	position: absolute;
	top: calc(-1 * var(--titlebar-area-height));
	height: calc(100% + var(--titlebar-area-height));
}
/* Where a panel being held would join others. */
.panel-joining {
	position: absolute;
	z-index: 50;
	background: var(--tq-color-accent);
	pointer-events: none;
}
.panel-joining.stack {
	height: 3px;
	margin-top: -1px;
}
/* Between two side by side, across the top or the bottom. */
.panel-joining.stack.across {
	width: 3px;
	margin-top: 0;
	margin-left: -1px;
}
.panel-joining.tab {
	opacity: 0.3;
}
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
.panel-icon {
	flex: none;
}
.panel-title .name {
	overflow: hidden;
	text-overflow: ellipsis;
	font-weight: 600;
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
.tab-content {
	display: flex;
	flex: 1 1 auto;
	flex-direction: column;
	min-height: 0;
}
.tab-content > :deep(*) {
	flex: 1 1 auto;
	min-height: 0;
}
.tools-divider {
	align-self: center;
	width: 1px;
	height: 20px;
	margin-inline: 4px;
	background: var(--tq-color-border);
}
.pane {
	box-sizing: border-box;
	height: 100%;
	padding: var(--tq-pane-padding);
}
.nothing-selected {
	padding-block: 12px;
	color: var(--tq-color-text-mute);
	text-align: center;
}
</style>
