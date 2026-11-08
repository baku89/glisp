<script setup lang="ts">
import { type AST, type Env, LetAST, print, solve, toAst, type TypeValue } from '@glisp/lang'
import { useEventListener } from '@vueuse/core'
import { InputButton } from 'tweeq/InputButton'
import { ParameterTree } from 'tweeq/ParameterGrid'
import { ScrollArea } from 'tweeq/ScrollArea'
import { MULTI_SELECT_HOST } from 'tweeq/stores/multiSelect'
import { computed, provide, ref, shallowRef, useTemplateRef, watch, watchEffect } from 'vue'

import { useNumberFieldEdits } from './numberFieldEdits'

import AstCodePopup from './AstCodePopup.vue'
import AstSlots from './AstSlots.vue'
import { type GlispDocument } from './document'
import { sourceOfProgram } from './programSource'
import FunctionAbout from './FunctionAbout.vue'
import { iconOf } from './icons'
import { keptReferences } from './keptReferences'
import { multiSelectHostOf } from './multiInputs'
import {
	copiedRows,
	pastedArguments,
	pastedRows,
	reach,
	withoutNearest,
	withoutRows,
	withParent,
	withSlotCommand,
} from './rowsClipboard'
import { extractedLiteralAt } from './multiRows'
import type { MenuItem } from 'tweeq/Menu'
import {
	ALSO_SELECTED,
	ISOLATED,
	LAYERS,
	SHOWN_WHOLE,
	ROW_PICKER,
	COMMANDS_FOR,
	HOST_KEY,
	LINKER,
	VALUE_PICKER,
	BLANK_FILLER,
	type ValuePicker,
	OPEN_ROW,
	RENAMER,
	REVEALER,
	SELECTION,
	type Selection,
	SOLVER,
	TITLED,
	useDeleteInInspector,
	FUNCTION_ICON,
	VALUE_ICON,
} from './selection'
import {
	moveBinding,
	parseSource,
	referenceAt,
	writtenReference,
	missingReferringTo,
	missingWritten,
	referenceTargetOf,
	renameBindingAt,
	type Slot,
	viewOf,
	slotCommandOfKey,
} from './structure'

const props = defineProps<{
	document: GlispDocument
	/** Only what adds, where the app around it has the rest, by key and from a menu. */
	compact?: boolean
	/** An icon for what a row comes to, over the one its type has. */
	iconOfValue?: (value: unknown) => string | null
	/** A function's icon, by how its head is written, over what it says of itself. */
	iconOfFunction?: (fn: string) => string | null
	/** A key that the app around it has for something else, before what it means to a row. */
	hostKey?: (event: KeyboardEvent) => boolean
	/** What the app has to offer for the slot at a path, over what is offered here. */
	/** How a value is chosen by pointing at something, if it can be. */
	valuePicker?: ValuePicker
	/** How something is chosen for where nothing is, rather than written there. */
	fillBlank?: (path: string, from: Element) => void
	commandsFor?: (path: string) => MenuItem[]
	/** Rows selected along with the one that is, from elsewhere, such as a canvas. */
	alsoSelected?: readonly string[]
	/** The rows gone through to one gone into, from elsewhere, such as a canvas. */
	isolated?: readonly string[]
	/**
	 * Among layers, the types shown whole, with what they are made from under them: a row lists
	 * what is of these in it, and one that is a vector of them all it holds. Nothing else is listed.
	 */
	shownWhole?: readonly TypeValue[]
	/** What a click on a row means to the app, with the keys held. False if it is not to be selected. */
	pickRow?: (path: string, event: MouseEvent) => boolean
	/** What rows are on a clipboard, if not their code, for what is outside of this. */
	copyAs?: (rows: readonly string[]) => string | null
	/** What is on a clipboard from outside of this, as code, if it can be. */
	pasteAs?: (text: string) => string | null
	/** Only the names, as a list of what there is, with the values left to an inspector. */
	layers?: boolean
	/**
	 * Be an inspector: only this row, open, and nothing of its own to say about keys
	 * or the selection, which are for the tree. Null with nothing to inspect.
	 */
	inspect?: string | null
}>()

const emit = defineEmits<{
	/** A row has been selected, or nothing is any more. */
	select: [path: string | null]
	/** The whole program is to be edited as code, which is elsewhere among layers. */
	code: []
	/** These rows have just been pasted. */
	pasted: [paths: readonly string[]]
	/**
	 * These rows referred to what has just been taken away, and are now what they came to.
	 * `before` is the program as it was before that, to go back to.
	 */
	kept: [paths: readonly string[], before: AST]
}>()

const show = (value: unknown, env: Env): string => {
	try {
		return toAst(value, env).print()
	} catch {
		return String(value)
	}
}

/**
 * The program as the rows show it. While something is being dragged from outside of them, on a
 * canvas or in an inspector, they stay as they were, and come to the program as it is once it is
 * let go of: they could not be pressed in the meantime, and drawing each row anew for each step
 * of a drag is most of what it takes. What is done to the program is done to it as it is.
 */
const $rows = useTemplateRef<HTMLElement>('$rows')
const pressedElsewhere = ref(false)
useEventListener(
	window,
	'pointerdown',
	(event: PointerEvent) => {
		const target = event.target as Node | null
		pressedElsewhere.value = !isInspector.value && $rows.value !== null && !(target !== null && $rows.value.contains(target))
	},
	{ capture: true }
)
for (const type of ['pointerup', 'pointercancel'] as const) {
	useEventListener(window, type, () => (pressedElsewhere.value = false), { capture: true })
}
// Only the window going out of focus, as anything in it doing so is no letting go.
useEventListener(window, 'blur', event => {
	if (event.target === window) pressedElsewhere.value = false
})
const shown = shallowRef({
	root: props.document.root.value,
	env: props.document.env.value,
})
watchEffect(() => {
	const next = {
		root: props.document.root.value,
		env: props.document.env.value,
	}
	if (!pressedElsewhere.value) shown.value = next
})

const bindings = computed(
	() => viewOf(shown.value.root, shown.value.env).slots
)

provide(LAYERS, props.layers ?? false)

const rootAppend = computed(
	() => viewOf(shown.value.root, shown.value.env).append
)

const revealTarget = shallowRef<{
	path: string
	rename?: boolean
	quiet?: boolean
} | null>(null)

function reset(): void {
	replaceRoot(new LetAST([], null))
}

function addBinding(): void {
	const { append } = viewOf(props.document.root.value, props.document.env.value)
	if (append === null) return
	replaceRoot(append.add())
	if (append.key !== undefined) {
		revealTarget.value = { path: append.key, rename: true }
	}
}

provide(MULTI_SELECT_HOST, multiSelectHostOf(props.document))

provide(REVEALER, {
	target: revealTarget,
	targetOf: path =>
		referenceTargetOf(props.document.root.value, props.document.env.value, path),
})

provide(RENAMER, {
	can: (path, name) =>
		renameBindingAt(
			props.document.root.value,
			props.document.env.value,
			path,
			name
		) !== null,
	apply(path, name) {
		const next = renameBindingAt(
			props.document.root.value,
			props.document.env.value,
			path,
			name
		)
		if (next !== null) replaceRoot(next)
	},
})

const linked = (source: string, target: string): AST | null =>
	referenceAt(props.document.root.value, props.document.env.value, source, target)

function linkReference(source: string, target: string): boolean {
	const next = linked(source, target)
	if (next === null) return false
	replaceRoot(next)
	return true
}

const writtenOf = (path: string): string | null =>
	writtenReference(props.document.root.value, props.document.env.value, path)

const pastedReference = (text: string): string | null =>
	props.document.copiedReference.value?.written === text
		? props.document.copiedReference.value.path
		: null

function copyReference(path: string): boolean {
	const written = writtenOf(path)
	if (written === null) return false
	props.document.copiedReference.value = { path, written }
	void navigator.clipboard.writeText(written)
	return true
}

// What a value is shown as is the same for as long as it is the same value, which an edit
// elsewhere leaves it, and drawing a shape small enough to be one is not nothing.
const iconsOf = new WeakMap<object, string | null>()
provide(VALUE_ICON, value => {
	if (typeof value !== 'object' || value === null) return props.iconOfValue?.(value) ?? null
	if (!iconsOf.has(value)) iconsOf.set(value, props.iconOfValue?.(value) ?? null)
	return iconsOf.get(value)!
})
provide(FUNCTION_ICON, fn => props.iconOfFunction?.(fn) ?? null)
provide(HOST_KEY, event => props.hostKey?.(event) ?? false)
if (props.valuePicker) provide(VALUE_PICKER, props.valuePicker)
if (props.fillBlank) provide(BLANK_FILLER, (path, from) => props.fillBlank?.(path, from))
if (props.commandsFor) provide(COMMANDS_FOR, path => props.commandsFor!(path))

provide(LINKER, {
	can: (source, target) => linked(source, target) !== null,
	link: linkReference,
	canCopy: path => writtenOf(path) !== null,
	canExtract: path => extractedLiteralAt(props.document.root.value, props.document.env.value, path) !== null,
	extract(path) {
		const result = extractedLiteralAt(props.document.root.value, props.document.env.value, path)
		if (result?.ast.kind === 'let') props.document.setRoot(result.ast)
	},
	copy: copyReference,
	pasted: pastedReference,
	pasteMissing(at, parameter, text) {
		const root = props.document.root.value
		const env = props.document.env.value
		const copied = pastedReference(text)
		const code = copied === null ? parseSource(text) : null
		const next =
			copied !== null
				? missingReferringTo(root, env, at, parameter, copied)
				: code !== null
					? missingWritten(root, env, at, parameter, code)
					: null
		if (next === null) return false
		replaceRoot(next)
		return true
	},
	pasteInto: (path, text) => giveArguments([path], text),
})

/** Why the last value asked of a row could not be, until something changes. */
const unsolved = shallowRef<string | null>(null)

provide(SOLVER, {
	replaceAt(path, next) {
		const reached = reach(props.document.root.value, props.document.env.value, path)
		const last = reached?.chain.at(-1)
		if (!reached || !last) return false
		replaceRoot(withParent(reached.chain, last.replace(next)))
		return true
	},
	solve(node, value, path) {
		const root = props.document.root.value
		const env = props.document.env.value
		const current = path === undefined ? null : reach(root, env, path)?.chain.at(-1)?.ast
		const { ast, diagnostics } = solve(root, env, current ?? node, value)
		unsolved.value = diagnostics[0]?.message ?? null
		if (ast !== null && ast !== props.document.root.value) replaceRoot(ast)
	},
})

type DropPosition = 'before' | 'after' | 'inside'

const moved = (source: string, target: string, position: DropPosition): AST | null =>
	moveBinding(
		props.document.root.value,
		props.document.env.value,
		source,
		target,
		position
	)
const canMove = (source: string, target: string, position: DropPosition): boolean =>
	moved(source, target, position) !== null

function move(source: string, target: string, position: DropPosition): void {
	const next = moved(source, target, position)
	if (next !== null) replaceRoot(next)
}

function replaceRoot(next: AST): void {
	if (next.kind === 'let') {
		props.document.setRoot(next)
	}
}

// The whole program as code, a binding to a line. It can only be a block of them, so
// that goes unsaid.
const editingEnv = ref(false)
const $envButton = useTemplateRef<HTMLElement>('$envButton')
const envSource = computed(() => sourceOfProgram(props.document.root.value))
const asEnv = (written: string): string => `{\n${written}\n}`
const refuseAsEnv = (next: AST): string | null =>
	next.kind === 'let' && (next.body === null || next.body.kind === 'vec')
		? null
		: 'This can only have bindings, and a vector of what to draw.'

const isInspector = computed(() => props.inspect !== undefined)
provide(OPEN_ROW, () => props.inspect ?? null)
provide(TITLED, isInspector.value)

/** The row being inspected, and the slots down to it, to go back up through. */
const inspected = computed(() => {
	if (!props.inspect) return null
	const parts = props.inspect.split('/')
	const parent = parts.slice(0, -1).join('/')
	const chain: Slot[] = []
	let node: AST = props.document.root.value
	let env: Env = props.document.env.value
	for (const key of parts) {
		const slots: readonly Slot[] = viewOf(node, env).slots
		const slot = slots.find(s => s.key === key)
		if (slot === undefined) return null
		chain.push(slot)
		node = slot.ast
		env = slot.env
	}
	// A cast says what it is, and what there is to it is what is in it.
	const castTo = viewOf(node, env).castTo ?? null
	const value = castTo === null ? undefined : viewOf(node, env).slots[0]
	if (value !== undefined) {
		chain.push(value)
		node = value.ast
		env = value.env
	}
	const view = viewOf(node, env, value?.expected ?? null)
	const own = chain.at(-1)!
	const path = value === undefined ? (props.inspect ?? '') : `${props.inspect}/${value.key}`
	return {
		chain,
		path,
		parentPath: value === undefined ? parent : props.inspect,
		view,
		castTo,
		icon: castTo === null ? null : iconOf(chain.at(-2)!.ast, chain.at(-2)!.env),
		// With nothing inside it, what there is to see of it is itself.
		alone: view.slots.length === 0 && view.missing.length === 0 && view.append === null,
		doc: view.head?.doc ?? castTo?.doc ?? own.doc ?? null,
	}
})

const inspectedFnIcon = computed(() => {
	const head = inspected.value?.view.head
	return head
		? (props.iconOfFunction?.(print(head.ast)) ?? head.icon ?? null)
		: (inspected.value?.icon ?? null)
})

/** The row inspected, or what holds it if it is alone, has changed, and so what is around. */
function replaceInspected(next: AST): void {
	const chain = inspected.value?.chain ?? []
	const from = inspected.value?.alone ? chain.length - 2 : chain.length - 1
	let parent = next
	for (let i = from; i >= 0; i--) parent = chain[i]!.replace(parent)
	replaceRoot(parent)
}

/** The rows a key is about: all that are selected, where something else selects them. */
const selectedRows = (): readonly string[] => {
	const also = props.alsoSelected ?? []
	if (also.length > 1) return also
	return selection.value === null ? [] : [selection.value.path]
}

function copyRows(): boolean {
	const text = copiedRows(
		props.document.root.value,
		props.document.env.value,
		selectedRows()
	)
	if (text === '') return false
	void navigator.clipboard.writeText(props.copyAs?.(selectedRows()) ?? text)
	return true
}

/** What is on the clipboard, given to the parameters that the rows at `paths` have for it. */
function giveArguments(paths: readonly string[], text: string): boolean {
	const next = pastedArguments(props.document.root.value, props.document.env.value, paths, text)
	if (next === null) return false
	replaceRoot(next)
	return true
}

/** What is on the clipboard, as more bindings, if it reads as them. */
function pasteBindings(text: string): boolean {
	const rows = pastedRows(
		props.document.root.value,
		props.document.env.value,
		selectedRows().at(-1) ?? null,
		text
	)
	if (rows === null) return false
	replaceRoot(rows.ast)
	emit('pasted', rows.paths)
	return true
}

/**
 * What is on the clipboard, by what it means to what is selected: a parameter that is
 * there for it, or else more bindings, which are also what it is if it has no place.
 */
function pasteOnSelection(written: string): boolean {
	const text = props.pasteAs?.(written) ?? written
	return giveArguments(selectedRows(), text) || pasteBindings(text)
}

/** The row at `path`, or the nearest of what holds it that can go. */
function removeNearest(path: string): void {
	const { root, env } = props.document
	const next = withoutNearest(root.value, env.value, path)
	if (next === null) return
	reselectNothing = true
	replaceKept(root.value, next)
}

function removeRows(): void {
	const { root, env } = props.document
	const next = withoutRows(root.value, env.value, selectedRows())
	reselectNothing = true
	replaceKept(root.value, next)
}

/** `after`, which is `before` with something taken away, keeping what referred to that. */
function replaceKept(before: AST, after: AST): void {
	const { ast, rows } = keptReferences(before, after, props.document.env.value)
	if (ast !== props.document.root.value) replaceRoot(ast)
	if (rows.length > 0) emit('kept', rows, before)
}

/**
 * What `remove` takes away, as one step, with what referred to it keeping what it came
 * to: for a row that takes itself away, through what holds it.
 */
function removing(remove: () => void): void {
	const { root } = props.document
	const before = root.value
	props.document.hold()
	try {
		remove()
		if (root.value !== before) replaceKept(before, root.value)
	} finally {
		props.document.release()
	}
}

const selection = shallowRef<Selection | null>(null)
provide(SELECTION, selection)
watch(
	() => props.inspect,
	() => {
		if (isInspector.value) selection.value = null
	}
)
provide(ALSO_SELECTED, () => props.alsoSelected ?? [])
provide(ISOLATED, () => props.isolated ?? [])
provide(SHOWN_WHOLE, props.shownWhole ?? [])
provide(ROW_PICKER, (path, event) => props.pickRow?.(path, event) ?? true)
useDeleteInInspector(selection, () => isInspector.value, removeNearest, removing)
/** What was selected has just gone, so there is nothing to select again. */
let reselectNothing = false
/** A row on its way to being selected again, having been edited. */
let reselecting: string | null = null
watch(selection, next => {
	if (next !== null) reselecting = null
	emit('select', next?.path ?? reselecting)
})

const rowExists = (path: string): boolean => {
	let node: AST = props.document.root.value
	let env: Env = props.document.env.value
	for (const key of path.split('/')) {
		const slots: readonly Slot[] = viewOf(node, env).slots
		const slot = slots.find(s => s.key === key)
		if (slot === undefined) return false
		node = slot.ast
		env = slot.env
	}
	return true
}

defineExpose({
	/** Have the value at `source` refer to `target`. False if it cannot, from there. */
	link: linkReference,
	canLink: (source: string, target: string): boolean => linked(source, target) !== null,
	/** Open the rows down to one, and select it. */
	reveal(path: string): void {
		revealTarget.value = { path }
	},
	/** Select no row. */
	deselect(): void {
		selection.value = null
	},
	copy: () => void copyRows(),
	cut(): void {
		if (copyRows()) removeRows()
	},
	remove: () => removeRows(),
	/** These bindings, again, as they are, whatever is selected. */
	duplicate: (text: string) => void pasteBindings(text),
	/** What is on the clipboard, as a paste would have it. */
	paste(written: string): void {
		const copied = props.document.copiedReference.value
		const place = selection.value?.path ?? null
		if (copied?.written === written && place !== null) {
			linkReference(place, copied.path)
			return
		}
		pasteOnSelection(written)
	},
})

// A selection deletes through the tree as it was, so an edit makes it again, from the
// row as it is now, if it is still there.
watch(props.document.root, () => {
	const path = reselectNothing ? null : (selection.value?.path ?? null)
	reselectNothing = false
	// A row already on its way to being selected, such as one just added, goes first.
	const coming = revealTarget.value?.path ?? null
	reselecting = coming ?? (path !== null && rowExists(path) ? path : null)
	selection.value = null
	unsolved.value = null
	if (coming === null && reselecting !== null) {
		revealTarget.value = { path: reselecting, quiet: true }
	}
})

// A press anywhere but on a row's label, or the menu it opened, ends a selection, unless
// where it was pressed has its own say in what is selected.
useEventListener(window, 'pointerdown', (event: PointerEvent) => {
	unsolved.value = null
	const target = event.target as Element | null
	if (target?.closest('.TqParameterTreeItem .row, [popover], [data-selects-rows]')) return
	selection.value = null
})

/**
 * What a reference is copied from, or pasted to, by the keyboard: the field being typed
 * in, if it is a row's, or else what is selected. Not the code being written, or a field
 * for something else, such as a name, unless what it is in says it is for this.
 */
function referencePlace(target: Element | null): NonNullable<Selection['reference']> | null {
	if (target?.closest?.('[data-takes-reference]')) {
		// Of what is selected where that field is, and not of some row elsewhere.
		if (!isInspector.value) return null
	} else {
		if (target?.closest?.('.AstCodePopup, [contenteditable]')) return null
		const field = target === null ? null : fieldPathOf(target)
		if (field !== null) return rowReference(field)
		if (target?.closest?.('input, textarea')) return null
	}
	const selected = selection.value
	return selected === null ? null : (selected.reference ?? rowReference(selected.path))
}

/** What a field is of, or anything else that takes hold of a value, as a pad or a dial does. */
function fieldPathOf(target: Element): string | null {
	const field = target.closest?.('.value[data-path]')?.getAttribute('data-path')
	return field ?? target.closest?.('[data-row-path]')?.getAttribute('data-row-path') ?? null
}

const rowReference = (path: string): NonNullable<Selection['reference']> => ({
	copy: () => copyReference(path),
	paste: target => linkReference(path, target),
})

// What is selected in the inspector is more particular than the row it is of, which
// stays selected, so the inspector has the first say.
const inspectorFirst = { capture: isInspector.value }

useEventListener(
	window,
	'keydown',
	(event: KeyboardEvent) => {
		const isCopy =
			(event.metaKey || event.ctrlKey) && event.altKey && !event.shiftKey && event.code === 'KeyC'
		if (!isCopy || event.defaultPrevented) return
		if (referencePlace(event.target as Element | null)?.copy()) event.preventDefault()
	},
	inspectorFirst
)

// A reference pastes as one, to wherever it goes, even into a field for a number.
useEventListener(
	window,
	'paste',
	(event: ClipboardEvent) => {
		if (event.defaultPrevented) return
		const copied = props.document.copiedReference.value
		if (copied === null || event.clipboardData?.getData('text') !== copied.written) return
		const place = referencePlace(event.target as Element | null)
		if (place === null) return
		event.preventDefault()
		if (!place.paste(copied.path)) {
			unsolved.value = 'it cannot refer to that from here'
		}
	},
	inspectorFirst
)

// A parameter that has been copied goes into a field as its value, not as what it is
// written as, which is only for finding where it goes.
useEventListener(
	window,
	'paste',
	(event: ClipboardEvent) => {
		if (event.defaultPrevented) return
		const target = event.target as Element | null
		const field = target?.closest?.('.value[data-path]')?.getAttribute('data-path')
		if (field == null || target?.closest?.('textarea, [contenteditable]')) return
		const text = event.clipboardData?.getData('text') ?? ''
		if (giveArguments([field], text)) event.preventDefault()
	},
	inspectorFirst
)

/** A row of the program, rather than something a host has put among them. */
const isRow = (path: string): boolean =>
	reach(props.document.root.value, props.document.env.value, path) !== null

// Pasting into a row, as code, whether it was copied as a value or as an expression. The
// inspector only has a say about a row selected in it.
useEventListener(
	window,
	'paste',
	(event: ClipboardEvent) => {
		if (event.defaultPrevented) return
		if (isInspector.value && (selection.value === null || !isRow(selection.value.path))) return
		const target = event.target as HTMLElement | null
		if (target?.closest?.('input, textarea, [contenteditable], .monaco-editor')) return
		const written =
			event.clipboardData?.getData('image/svg+xml') || (event.clipboardData?.getData('text') ?? '')
		if (pasteOnSelection(written)) {
			event.preventDefault()
			return
		}
		if (selection.value?.paste === undefined) return
		event.preventDefault()
		const next = parseSource(props.pasteAs?.(written) ?? written)
		if (next === null) unsolved.value = 'what is on the clipboard cannot be read as code'
		else selection.value.paste(next)
	},
	inspectorFirst
)

// What is selected in an inspector is what a copy is of, over the row it is inside of.
useEventListener(
	window,
	'keydown',
	(event: KeyboardEvent) => {
		const key = event.key.toLowerCase()
		if (!(event.metaKey || event.ctrlKey) || event.altKey || (key !== 'c' && key !== 'x')) return
		const selected = selection.value
		if (!isInspector.value || selected === null || !isRow(selected.path)) return
		const target = event.target as HTMLElement | null
		if (target?.closest?.('input, textarea, [contenteditable], .monaco-editor')) return
		if (!getSelection()?.isCollapsed) return
		event.stopPropagation()
		event.preventDefault()
		if (!copyRows()) selected.evaluate?.('copy')
		else if (key === 'x') removeRows()
	},
	{ capture: true }
)

// The same goes for what a key says about it, as a parameter can be pinned on its own.
useEventListener(
	window,
	'keydown',
	(event: KeyboardEvent) => {
		const selected = selection.value
		const command = slotCommandOfKey(event)
		const writes = event.key === '=' && !event.metaKey && !event.ctrlKey && !event.altKey
		// As the menu says of it. A button has its own use for Enter.
		const renames =
			(event.key === 'Enter' || event.key === 'F2') &&
			!event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey &&
			selected?.rename !== undefined &&
			!(event.target as HTMLElement | null)?.closest?.('button')
		if (!isInspector.value || (command === null && !writes && !renames) || event.defaultPrevented) return
		const target = event.target as HTMLElement | null
		// A lock has nothing to do with what is being typed, and is of whatever has the focus.
		const field = command !== null && command !== 'hide' && target !== null && !target.closest?.('.AstCodePopup, .monaco-editor')
			? fieldPathOf(target)
			: null
		if (field !== null) {
			event.stopPropagation()
			event.preventDefault()
			const { root, env } = props.document
			const next = withSlotCommand(root.value, env.value, [field], command!)
			if (next !== null) props.document.setRoot(next as LetAST)
			return
		}
		if (selected === null) return
		if (target?.closest?.('input, textarea, [contenteditable], .monaco-editor')) return
		event.stopPropagation()
		event.preventDefault()
		if (renames) selected.rename?.()
		else if (command === null) selected.editExpression?.()
		else selected.evaluate?.(command)
	},
	{ capture: true }
)

if (!isInspector.value) useNumberFieldEdits(props.document)

useEventListener(window, 'keydown', (event: KeyboardEvent) => {
	if (isInspector.value || props.hostKey?.(event)) return
	const target = event.target as HTMLElement | null
	if (target?.closest('input, textarea, [contenteditable], .monaco-editor')) return
	const isMod = event.metaKey || event.ctrlKey
	if (isMod && event.key.toLowerCase() === 'z') {
		event.preventDefault()
		if (event.shiftKey) props.document.redo()
		else props.document.undo()
	} else if (isMod && !event.altKey && event.key.toLowerCase() === 'c') {
		// Text that is selected, as in a REPL, is what a copy means if there is any.
		if (selection.value?.evaluate === undefined || !getSelection()?.isCollapsed) return
		event.preventDefault()
		if (!copyRows()) selection.value.evaluate('copy')
	} else if (isMod && event.key.toLowerCase() === 'x') {
		if (selection.value === null || !getSelection()?.isCollapsed) return
		event.preventDefault()
		if (copyRows()) {
			removeRows()
		} else if (selection.value.remove !== undefined) {
			selection.value.evaluate?.('copy')
			removing(selection.value.remove)
		}
	} else if (event.key.toLowerCase() === 'e' && isMod && !event.altKey) {
		if (selection.value?.evaluate === undefined) return
		event.preventDefault()
		selection.value.evaluate(event.shiftKey ? 'all' : 'step')
	} else if (event.key.toLowerCase() === 'h' && !isMod && !event.altKey) {
		if (selection.value?.evaluate === undefined) return
		event.preventDefault()
		selection.value.evaluate('hide')
	} else if (event.key.toLowerCase() === 'l' && isMod && !event.shiftKey && !event.altKey) {
		if (selection.value?.evaluate === undefined) return
		event.preventDefault()
		selection.value.evaluate('pin')
	} else if (event.key.toLowerCase() === 'v' && !isMod && !event.altKey) {
		if (selection.value?.editValue === undefined) return
		event.preventDefault()
		selection.value.editValue()
	} else if (event.key === '=' && !isMod && !event.altKey) {
		event.preventDefault()
		if (selection.value !== null) selection.value.editExpression?.()
		else if (props.layers) emit('code')
		else editingEnv.value = true
	} else if (event.key === 'Enter' || event.key === 'F2') {
		if (selection.value?.rename === undefined) return
		event.preventDefault()
		selection.value.rename()
	} else if (event.key === 'Delete' || event.key === 'Backspace') {
		if (selection.value === null) return
		if ((props.alsoSelected?.length ?? 0) > 1) {
			event.preventDefault()
			removeRows()
		} else if (selection.value.remove !== undefined) {
			event.preventDefault()
			removing(selection.value.remove)
		} else {
			event.preventDefault()
			removeNearest(selection.value.path)
		}
	} else if (event.key === 'Escape') {
		selection.value = null
	}
})
</script>

<template>
	<div v-if="isInspector" class="AstEditor inspector" data-selects-rows>
		<ScrollArea class="tree">
			<template v-if="inspected !== null">
				<FunctionAbout
					:label="inspected.view.head?.label ?? inspected.castTo?.label ?? null"
					:doc="inspected.doc"
					:icon="inspectedFnIcon"
				/>
				<ParameterTree name="glisp.inspector" :labelWidth="110">
					<AstSlots
						:key="inspect ?? ''"
						:slots="inspected.alone ? [inspected.chain.at(-1)!] : inspected.view.slots"
						:parentPath="inspected.alone ? inspected.parentPath : inspected.path"
						:missing="inspected.alone ? [] : inspected.view.missing"
						:append="inspected.alone ? null : inspected.view.append"
						:read="document.read"
						:show="show"
						@change="replaceInspected"
					/>
				</ParameterTree>
			</template>
			<!-- What a host has to say of it too, in rows that share this selection. -->
			<slot />
		</ScrollArea>
	</div>
	<div v-else ref="$rows" class="AstEditor" :class="{ layers }">
		<div v-if="!layers" class="toolbar">
			<InputButton
				v-if="!compact"
				icon="mdi:undo"
				tooltip="Undo"
				subtle
				:disabled="!document.canUndo.value"
				@click="document.undo()"
			/>
			<InputButton
				v-if="!compact"
				icon="mdi:redo"
				tooltip="Redo"
				subtle
				:disabled="!document.canRedo.value"
				@click="document.redo()"
			/>
			<InputButton icon="mdi:plus" label="Add" subtle @click="addBinding" />
			<span ref="$envButton" class="env-button">
				<InputButton
					icon="mdi:code-braces"
					:tooltip="{ content: 'Edit Expression', shortcut: ['='] }"
					subtle
					@click="editingEnv = true"
				/>
			</span>
			<AstCodePopup
				v-if="editingEnv"
				:reference="$envButton"
				:ast="document.root.value"
				:start="envSource"
				:expand="asEnv"
				:refuse="refuseAsEnv"
				@change="replaceRoot"
				@close="editingEnv = false"
			/>
			<InputButton
				v-if="!compact"
				class="reset"
				icon="mdi:restore"
				label="Reset"
				subtle
				:disabled="bindings.length === 0"
				@click="reset"
			/>
		</div>
		<ScrollArea class="tree">
			<ParameterTree name="glisp.env" :canDrop="canMove" @move="move">
				<AstSlots
					:slots="bindings"
					parentPath=""
					:append="rootAppend"
					noAddRow
					:read="document.read"
					:show="show"
					@change="replaceRoot"
				/>
			</ParameterTree>
		</ScrollArea>
		<!-- What is wrong with a value shows on it. This is what could not be done just now. -->
		<p v-if="unsolved !== null" class="problems">Cannot do that: {{ unsolved }}</p>
	</div>
</template>

<style scoped>
/* As tall as what it shows, for what holds it to go by. */
.AstEditor.inspector {
	height: auto;
	min-height: 0;
}
.AstEditor.inspector .tree {
	flex: 0 1 auto;
}
/* Names alone: the value's column goes, with what resizes it. */
.layers :deep(.TqParameterGrid.grid) {
	grid-template-columns: minmax(0, 1fr) 0;
}
.layers :deep(.TqParameter > .input),
.layers :deep(.resizer) {
	display: none;
}
.AstEditor {
	display: flex;
	flex-direction: column;
	gap: var(--tq-gap-control);
	height: 100%;
	min-width: 0;
}
/* Only the tree scrolls, so that what acts on it stays in reach. */
.tree {
	flex: 1;
	/* Room for the ring of a focused input, and a selected row's color, which it would
	clip, taken from around it so that the rows stay where they are. */
	margin: -1px;
	padding: 3px;
}
.reset {
	margin-left: auto;
}
.env-button {
	display: inline-flex;
}
.toolbar {
	flex-shrink: 0;
	width: auto;
	display: flex;
	gap: var(--tq-gap-related);
}
.problems {
	flex-shrink: 0;
	font-family: var(--tq-font-code);
	color: var(--tq-color-error);
}
</style>
