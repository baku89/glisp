<script setup lang="ts">
import { type AST, LetAST, parse, print } from '@glisp/lang'
import {
	AstEditor,
	AstMultiInspector,
	AstProgramCode,
	inspectionOf,
	useGlispDocument,
} from '@glisp/tweeq'
import { combined, type Filter, filtersFor, wrappedAt } from '@glisp/tweeq/filters'
import { copiedBySlotCommand, copiedRows, reach, slotCommandAt, withSlotCommand } from '@glisp/tweeq/rowsClipboard'
import { renameBindingAt, SLOT_COMMANDS, type SlotCommand } from '@glisp/tweeq/structure'
import { useMediaQuery } from '@vueuse/core'
import type { mat2d } from 'linearly'
import { App as TqApp } from 'tweeq/App'
import { Icon } from 'tweeq/Icon'
import { useAppConfigStore } from 'tweeq/stores/appConfig'
import { useActionsStore } from 'tweeq/stores/actions'
import { useThemeStore } from 'tweeq/stores/theme'
import { Menu, type MenuItem } from 'tweeq/Menu'
import { Popover } from 'tweeq/Popover'
import { TitleBar } from 'tweeq/TitleBar'
import { vTooltip } from 'tweeq/Tooltip'
import { initTweeq } from 'tweeq/useTweeq'
import { computed, nextTick, ref, useTemplateRef, watch, watchEffect } from 'vue'

import CanvasView from './CanvasView.vue'
import { exportSvg, openFile, saveFile } from './files'
import FloatPanel from './FloatPanel.vue'
import { iconOfFunction, SHAPE_ICONS } from './functionIcons'
import { iconOfPath, inkOn, withGraphics, isRect, type RectValue } from './graphics'
import type { GridKind } from './grid'
import PaintControls from './PaintControls.vue'
import RowName from './RowName.vue'
import {
	type Arrange,
	arranged,
	type Area,
	boundsOfRows,
	drawnRows,
	grouped,
	nameOfRow,
	rowCalled,
	ungrouped,
	viewToFit,
} from './rows'
import { backgroundOf, isBackgroundAt, paintedRow, pathOfRow, withPaintOfRows } from './scene'
import {
	actionTypesOver,
	copyableType,
	exportableType,
	groupType,
	numberType,
	pathType,
	rowType,
	type Selected,
	selectedOf,
	slotTypes,
	valueTextOf,
} from './selection'
import { bindingsOfSvg, svgOfRows } from './svg'
import ToolBar from './ToolBar.vue'
import { type Arrangement, arranged as arrangedTools } from './toolbar'

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

/**
 * A program as written now, from what was written before: `style` was once a member of
 * `path`, and what a rectangle starts from was once its `topLeft`.
 */
const fromBefore = (source: string): string =>
	source
		.replaceAll('(path.style ', '(style ')
		.replaceAll('/topLeft', '/origin')
		.replaceAll('topLeft=', 'origin=')

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
const NOT_FILTERS: ReadonlySet<string> = new Set(['style', 'background'])

const TOOLS = [
	{ name: 'select', label: 'Select', key: 'v', icon: 'ph:cursor-fill' },
	{ name: 'pen', label: 'Pen', key: 'p', icon: 'ph:pen-nib' },
	{ name: 'pencil', label: 'Pencil', key: 'b', icon: 'ph:pencil-simple' },
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
] as const
const tool = ref<(typeof TOOLS)[number]['name']>('select')

/** What is on the bar at first: the rest is there behind its dots, until it is wanted. */
const FIRST_TOOLS: Arrangement = {
	shown: ['select', 'pen', 'pencil', 'rect', 'ellipse', 'ngon'],
	stowed: ['star', 'roundRect', 'superellipse', 'capsule', 'fan', 'spiral', 'clothoid'],
}
const toolsKept = useAppConfigStore().ref<Partial<Arrangement> | null>('glisp.canvas.tools', null)
const toolArrangement = computed(() => arrangedTools(toolsKept.value, FIRST_TOOLS))
const drawing = computed(() => (tool.value === 'select' ? null : tool.value))

/** A drag says its numbers exactly, and they can be typed once it is let go of. */
const dimensionsOn = useAppConfigStore().ref('glisp.canvas.dimensions', false)

/** What is laid over the canvas to see by, which is of this browser and not of the program. */
const grid = useAppConfigStore().ref<GridKind>('glisp.canvas.grid', 'dots')
const toggleGrid = (kind: GridKind): void => {
	grid.value = grid.value === kind ? 'none' : kind
}
/** A drag or a drawing goes to what it comes near. */
const snappingOn = useAppConfigStore().ref('glisp.canvas.snapping', true)

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
const inspectorWidth = useAppConfigStore().ref('glisp.canvas.inspector.width', 320)
const TAB_WIDTH = 32
const origin = [
	(projectOpen.value ? projectWidth.value : TAB_WIDTH) + ORIGIN_MARGIN,
	ORIGIN_MARGIN,
] as const

const PROJECT_TABS = [
	{ name: 'layers', label: 'Project', icon: 'ph:tree-view' },
	{ name: 'code', label: 'Code', icon: 'ph:code' },
] as const
const projectTab = useAppConfigStore().ref<'layers' | 'code'>('glisp.canvas.project.tab', 'layers')
// What was kept before the REPL had a panel of its own.
if (!PROJECT_TABS.some(({ name }) => name === projectTab.value)) projectTab.value = 'layers'
const inspectorOpen = useAppConfigStore().ref('glisp.canvas.inspector.open', true)

const programOf = (root: { kind: string }): LetAST | null =>
	root instanceof LetAST ? root : null

/** The file it is kept in, once it is in one. */
let fileHandle: FileSystemFileHandle | null = null

function readProgramText(text: string): void {
	try {
		const next = programOf(parse(fromBefore(text)))
		if (next !== null) document.setRoot(new LetAST(next.bindings, null))
	} catch {
		// What cannot be read leaves what is there.
	}
}

async function open(): Promise<void> {
	const opened = await openFile()
	if (opened === null) return
	fileHandle = opened.handle
	readProgramText(opened.text)
	selectOnCanvas([])
}

async function save(asNew: boolean): Promise<void> {
	const handle = await saveFile(print(document.root.value), asNew ? null : fileHandle)
	if (handle !== null) fileHandle = handle
}

// A file opened with this app, from outside of it.
const launching = window as unknown as {
	launchQueue?: {
		setConsumer(consumer: (params: { files: FileSystemFileHandle[] }) => void): void
	}
}
launching.launchQueue?.setConsumer(async ({ files: [handle] }) => {
	if (!handle) return
	fileHandle = handle
	readProgramText(await (await handle.getFile()).text())
})

function setProgram(next: LetAST | null, rows?: readonly string[]): void {
	if (next === null) return
	document.setRoot(next)
	if (rows) selectOnCanvas(rows)
}

function arrange(how: Arrange): void {
	const root = programOf(document.root.value)
	if (root) setProgram(arranged(root, selected.value, how))
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
	const left = projectOpen.value ? projectWidth.value : TAB_WIDTH
	const right = inspectorOpen.value ? inspectorWidth.value : TAB_WIDTH
	return [left + FIT_MARGIN, FIT_MARGIN, width - right - FIT_MARGIN, height - FIT_MARGIN]
}

function fit(rows?: readonly string[]): void {
	const box = boundsOfRows(document.root.value, document.env.value, rows)
	if (box) $canvas.value?.glideTo(viewToFit(box, freeArea()) as unknown as mat2d)
}

const ZOOM_STEP = 1.5
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
const paintable = computed(() =>
	selected.value.filter(row => {
		const [root, env] = [document.root.value, document.env.value]
		// A part of what a row is written as, such as a number, has no fill or line unless it is a path.
		const isPart = !row.split('/').every(key => key.startsWith('binding:'))
		return !isBackgroundAt(root, env, row) && (!isPart || pathOfRow(root, env, row) !== null)
	})
)

// A background goes up through the title bar, and the window's own where it has one.
const background = computed(() => backgroundOf(document.root.value, document.env.value))
const titleBarStyle = computed(() =>
	background.value === null
		? undefined
		: { '--tq-titlebar-background': background.value, color: inkOn(background.value) }
)
// After the theme, which writes its own background here whenever it changes.
const themeColorMeta = window.document.querySelector('meta[name="theme-color"]')
watchEffect(
	() => themeColorMeta?.setAttribute('content', background.value ?? theme.colorBackground),
	{ flush: 'post' }
)

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
	glideTo(next: mat2d): void
	zoomBy(factor: number): void
	zoomTo(zoom: number): void
	rowAtPoint(x: number, y: number): string | null
	size(): readonly [number, number]
}>('$canvas')

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

const renamed = (row: string, name: string) =>
	renameBindingAt(document.root.value, document.env.value, row, name)

function renameRow(row: string, name: string): void {
	const next = renamed(row, name)
	if (!(next instanceof LetAST)) return
	document.setRoot(next)
	if (selected.value.includes(row)) {
		selectOnCanvas(selected.value.map(it => (it === row ? rowCalled(row, name) : it)))
	}
}

const inspection = computed(() =>
	inspected.value === null
		? null
		: inspectionOf(document.root.value, document.env.value, inspected.value)
)

const actions = useActionsStore()

const selection = computed(() =>
	selectedOf(document.root.value, document.env.value, selected.value)
)
/** What a hole can be filled from, when nothing selected fills it. */
const rowsToChoose = computed(() => {
	const root = programOf(document.root.value)
	return root
		? selectedOf(root, document.env.value, root.bindings.map(([name]) => rowCalled('', name)))
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
	const all = (filter: Filter, of: readonly string[]): LetAST | null =>
		combined(root, env, namesOf(of), insideOf(of), filter, call =>
			filter.fn.returnType === pathType ? withPaintOfRows(root, env, of, call) : call
		)
	// What they became goes by the first of them.
	const firstOf = (of: readonly string[]): string[] => of.slice(0, 1)
	return filtersFor(chosen.map(({ value }) => value), env)
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
							if (next) setProgram(next, firstOf(of))
						},
					},
				]
			}
			const done = together ? all(filter, rows) : wrappedAt(root, env, paintedRow(root, env, rows[0]!), filter)
			if (!(done instanceof LetAST)) return []
			return [
				{ ...item, perform: () => setProgram(done, firstOf(rows)) },
			]
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

/** What can be done to the slot at `path`, or to all that is selected, if it is among that. */
function commandsFor(path: string): MenuItem[] {
	const rows = selected.value.includes(path) ? selected.value : [path]
	return actions.menuFor(selectedOf(document.root.value, document.env.value, rows))
}

const canvasMenu = ref<readonly [number, number] | null>(null)
const canvasMenuItems = computed(() =>
	canvasMenu.value === null
		? []
		: actions.menuFor(selection.value)
)

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
					fileHandle = null
					document.setRoot(new LetAST([], null))
					selectOnCanvas([])
				},
			},
			{ id: 'file_open', label: 'Open...', icon: 'mdi:folder-open-outline', bind: 'command+o', perform: open },
			{ id: 'file_save', label: 'Save', icon: 'mdi:content-save-outline', bind: 'command+s', perform: () => save(false) },
			{ id: 'file_save_as', label: 'Save As...', icon: 'mdi:content-save-edit-outline', bind: 'command+shift+s', perform: () => save(true) },
			{
				id: 'file_export_svg',
				label: 'Export SVG...',
				icon: 'mdi:export-variant',
				// What is drawn, or an area, or both: that much of those. With neither, it is all there is.
				params: [{ name: 'what', type: exportableType, many: true, optional: true }],
				perform(chosen: readonly Selected[] = []) {
					const root = document.root.value
					const env = document.env.value
					const area = chosen.find(({ value }) => isRect(value))?.value as RectValue | undefined
					const drawings = chosen.filter(({ value }) => !isRect(value)).map(({ row }) => row)
					const svg = svgOfRows(root, env, drawings.length > 0 ? drawings : drawnRows(root, env), area)
					if (svg !== null) void exportSvg(svg)
				},
			},
		],
	},
	{
		id: 'edit',
		order: 20,
		icon: 'mdi:pencil-outline',
		children: [
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
				perform: () => selectOnCanvas(drawnRows(document.root.value, document.env.value)),
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
			{ id: 'object_group', label: 'Group', icon: 'mdi:group', bind: 'command+g', params: [rowsParam], perform: onRows(() => group()) },
			{ id: 'object_ungroup', label: 'Ungroup', icon: 'mdi:ungroup', bind: 'command+shift+g', params: [{ name: 'groups', type: groupType, many: true }], perform: onRows(ungroup) },
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
			{ id: 'view_project', label: 'Toggle Project', icon: 'ph:tree-view', perform: () => (projectOpen.value = !projectOpen.value) },
			{ id: 'view_inspector', label: 'Toggle Inspector', icon: 'ph:sliders-horizontal', perform: () => (inspectorOpen.value = !inspectorOpen.value) },
			{ id: 'view_dimensions', label: 'Toggle Dimensions', icon: 'ph:ruler', bind: 'd', perform: () => (dimensionsOn.value = !dimensionsOn.value) },
			{ id: 'view_snapping', label: 'Toggle Snapping', icon: 'ph:magnet', bind: 'command+u', perform: () => (snappingOn.value = !snappingOn.value) },
			{ id: 'view_dots', label: 'Toggle Dots', icon: 'ph:dots-nine', perform: () => toggleGrid('dots') },
			{ id: 'view_grid', label: 'Toggle Grid', icon: 'ph:grid-four', perform: () => toggleGrid('lines') },
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

// A row that is one of several stays one of several, as the tree only has the one.
function selectInTree(row: string | null): void {
	if (row === null) selected.value = []
	else if (!selected.value.includes(row)) selected.value = [row]
}
</script>

<template>
	<TqApp>
		<template #title>
			<TitleBar name="Glisp / Canvas" icon="favicon.svg" :style="titleBarStyle" />
		</template>
		<template #default>
			<div class="stage">
				<CanvasView
					ref="$canvas"
					class="canvas"
					:document="document"
					:selected="selected"
					:origin="origin"
					:drawing="drawing"
					:dimensions="dimensionsOn"
					:snapping="snappingOn"
					:grid="grid"
					@select="selectOnCanvas"
					@menu="openCanvasMenu"
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
							:hostKey="isToolKey"
							:commandsFor="commandsFor"
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
						<AstProgramCode
							:document="document"
							:selected="selected"
							@problem="codeHasProblem = $event"
							@select="selectOnCanvas"
						/>
					</div>
				</FloatPanel>
				<FloatPanel
					v-model:open="inspectorOpen"
					name="glisp.canvas.inspector"
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
							<Icon class="panel-icon" icon="ph:sliders-horizontal" />
							<template v-if="inspection">
								<RowName
									:key="selected[0]"
									:row="selected[0]!"
									:label="selectedName ?? ''"
									:source="nameOfRow(selected[0]!)"
									:can="(row, name) => renamed(row, name) !== null"
									@rename="renameRow"
								/>
							</template>
							<template v-else-if="selected.length > 1">
								<span class="name">{{ selected.length }} selected</span>
							</template>
							<span v-else class="name">Inspector</span>
						</span>
					</template>
					<AstMultiInspector
						v-if="selected.length > 1"
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
						:iconOfValue="iconOfPath"
						:copyAs="rows => svgOfRows(document.root.value, document.env.value, rows)"
						:pasteAs="bindingsOfSvg"
						:iconOfFunction="iconOfFunction"
					>
						<PaintControls v-if="paintable.length > 0" :document="document" :rows="paintable" />
					</AstEditor>
				</FloatPanel>
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
.stage {
	/* How round the curves are by which what comes out of an edge of the window goes into it.
	Its own corners are its own, going around what is in it. */
	--edge-fillet: 8px;
	position: relative;
	height: 100%;
}
/* The canvas goes on up under the title bar, and only the canvas: panels stay below it. */
.stage .canvas {
	position: absolute;
	top: calc(-1 * var(--titlebar-area-height));
	height: calc(100% + var(--titlebar-area-height));
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
	display: flex;
	flex: 1 1 auto;
	flex-direction: column;
	min-height: 0;
}
.tab-content > :deep(*) {
	flex: 1 1 auto;
	min-height: 0;
}
.problem-dot {
	width: 6px;
	height: 6px;
	border-radius: 50%;
	background: var(--tq-color-error);
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
</style>
