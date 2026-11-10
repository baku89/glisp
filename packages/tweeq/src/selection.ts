import type { TypeValue } from '@glisp/lang'
import type { AST } from '@glisp/lang'
import { useEventListener } from '@vueuse/core'
import type { MenuItem } from 'tweeq/Menu'
import { type InjectionKey, onBeforeUnmount, type ShallowRef } from 'vue'

/** The slot selected in an editor, and how to delete it, if it can go. */
export interface Selection {
	readonly path: string
	readonly remove?: () => void
	readonly rename?: () => void
	/** Run one of the actions that have a key. */
	readonly evaluate?: (id: 'step' | 'all' | 'pin' | 'hide' | 'copy') => void
	/** Go into what it comes to, if that is a number, or into what it is written as. */
	readonly editValue?: () => void
	readonly editExpression?: () => void
	/** Put this in its place, as what is pasted. */
	readonly paste?: (next: AST) => void
	/** How a reference goes from and to it, if it is not simply the row at `path`. */
	readonly reference?: {
		copy(): boolean
		/** Have it refer to the row at `target`. */
		paste(target: string): boolean
	}
}

/** What a host has that is to go before any row does, if there is anything. */
const hostDeletes = new Set<() => boolean>()

/** Whether a host had something to delete, with which that key has done all it does. */
function deletedByHost(event: KeyboardEvent): boolean {
	if (![...hostDeletes].some(deletes => deletes())) return false
	// Whichever of these got to it first, which is whichever was mounted first.
	event.stopImmediatePropagation()
	event.preventDefault()
	return true
}

/**
 * The delete key, for what a host has selected of its own, before any row. `deletes` says whether
 * there was any of that, and only has it go if the key is not being typed with.
 */
export function useHostDelete(deletes: () => boolean): void {
	hostDeletes.add(deletes)
	onBeforeUnmount(() => hostDeletes.delete(deletes))
	useEventListener(
		window,
		'keydown',
		(event: KeyboardEvent) => {
			if (event.key !== 'Delete' && event.key !== 'Backspace') return
			const target = event.target as HTMLElement | null
			if (target?.closest?.('input, textarea, [contenteditable], .monaco-editor')) return
			deletedByHost(event)
		},
		{ capture: true }
	)
}

/**
 * Deleting is about the row selected in an inspector, while there is one, rather than
 * what is selected elsewhere. A row that cannot go leaves it to `removeNearest`, if it is
 * given, to go up through what holds it. `removing` is how a row that can go is taken away,
 * for what else that changes to be done along with it.
 */
export function useDeleteInInspector(
	selection: ShallowRef<Selection | null>,
	isInspector: () => boolean = () => true,
	removeNearest?: (path: string) => void,
	removing: (remove: () => void) => void = remove => remove()
): void {
	useEventListener(
		window,
		'keydown',
		(event: KeyboardEvent) => {
			if (event.key !== 'Delete' && event.key !== 'Backspace') return
			const target = event.target as HTMLElement | null
			if (target?.closest?.('input, textarea, [contenteditable], .monaco-editor')) return
			if (deletedByHost(event)) return
			const selected = selection.value
			if (!isInspector() || selected === null) return
			event.stopPropagation()
			event.preventDefault()
			selection.value = null
			if (selected.remove !== undefined) removing(selected.remove)
			else removeNearest?.(selected.path)
		},
		{ capture: true }
	)
}

/** How a row renames the binding it shows, which takes the whole program. */
export interface BindingRenamer {
	can(path: string, name: string): boolean
	apply(path: string, name: string): void
}

export const RENAMER: InjectionKey<BindingRenamer> = Symbol('glisp-renamer')

/** How a row asks for what it shows to come to a value, which takes the whole program. */
export interface BackwardSolver {
	/**
	 * Edit the program so that `node` gives `value`, or else say why it cannot be. With
	 * `path`, it is what is there now, for several to be asked of at once.
	 */
	solve(node: AST, value: unknown, path?: string): void
	/** Put `next` at `path` in the program as it is now, for the same reason. */
	replaceAt(path: string, next: AST): boolean
}

export const SOLVER: InjectionKey<BackwardSolver> = Symbol('glisp-solver')

/**
 * How a number asks to come to a value along with the others of its vector, if they
 * are kept in ratio. If they are not, it says so, and the number goes on by itself.
 */
export type RatioKeeper = (path: string, value: number) => boolean

export const RATIO_KEEPER: InjectionKey<RatioKeeper> = Symbol('glisp-ratio-keeper')

/** How a row comes to refer to another, which takes the whole program. */
export interface Linker {
	can(source: string, target: string): boolean
	link(source: string, target: string): void
	canCopy(path: string): boolean
	/** Puts a reference to the row on the clipboard, as what it is written as from the top. */
	copy(path: string): boolean
	/** The row that `text` on the clipboard is a reference to, if it is one. */
	pasted(text: string): string | null
	/** Give the call at `at` what it is not yet given of `parameter`, as `text` on the clipboard. */
	pasteMissing(at: string, parameter: string, text: string): boolean
	/** Gives what is written out at `path` a name in the program, if it can have one. */
	canExtract(path: string): boolean
	extract(path: string): void
	/** Puts what `text` binds where it belongs at `path`, if it reads so and has a place. */
	pasteInto(path: string, text: string): boolean
}

export const LINKER: InjectionKey<Linker> = Symbol('glisp-linker')

/** A key that the app around an editor has for something else. See `AstEditor`. */
export const HOST_KEY: InjectionKey<(event: KeyboardEvent) => boolean> = Symbol('glisp-host-key')

/** What the app around an editor has to offer for the slot at a path, as a menu. */
export const COMMANDS_FOR: InjectionKey<(path: string) => MenuItem[]> =
	Symbol('glisp-commands-for')

/** An icon for what a row comes to, if a host has one, such as the shape itself. */
export const VALUE_ICON: InjectionKey<(value: unknown) => string | null> =
	Symbol('glisp-value-icon')

/** An icon for a function, by how its head is written, if a host has one. */
export const FUNCTION_ICON: InjectionKey<(fn: string) => string | null> =
	Symbol('glisp-function-icon')

/** Whether this is a list of what there is, where only a group opens. */
/** How a host has a value chosen by pointing at something, for what can be pointed at. */
export interface ValuePicker {
	wants(expected: TypeValue | null): boolean
	/** Whether the value at `path` is what is being chosen for now. */
	isFor(path: string): boolean
	/** Start choosing for it, from what is pressed, or stop. */
	toggle(path: string, from: Element): void
	/**
	 * What there is at a place on screen that the value at `path` could be, if anything, as
	 * the pointer is pulled over it, for a host to show it. Null for the place once it has gone.
	 */
	over?(path: string, at: readonly [number, number] | null): string | null
	/** Have the value at `path` be what `row` is. False if it cannot. */
	pick?(path: string, row: string): boolean
}
export const VALUE_PICKER: InjectionKey<ValuePicker> = Symbol('glisp-value-picker')

/**
 * How a host has something chosen to go where nothing is, `()`, from among what fits there,
 * rather than its being written. `from` is what was pressed, for that to come up by it.
 */
export const BLANK_FILLER: InjectionKey<(path: string, from: Element) => void> =
	Symbol('glisp-blank-filler')

/** Whether what is around a row is locked, and what is in it with it. */
export const LOCKED: InjectionKey<() => boolean> = Symbol('glisp-locked')
export const LAYERS: InjectionKey<boolean> = Symbol('glisp-layers')

/** Opening the rows down to one, and selecting it. */
export interface RowRevealer {
	/** The row to get to, until it has been reached, and whether to rename it there. */
	readonly target: ShallowRef<{ path: string; rename?: boolean; quiet?: boolean } | null>
	/** Where the name at `path` is bound, among the rows. */
	targetOf(path: string): string | null
}

export const REVEALER: InjectionKey<RowRevealer> = Symbol('glisp-revealer')

export const SELECTION: InjectionKey<ShallowRef<Selection | null>> =
	Symbol('glisp-selection')

/** The rows selected along with the one that is, from elsewhere, such as a canvas. */
export const ALSO_SELECTED: InjectionKey<() => readonly string[]> = Symbol('also-selected')

/** The rows gone through to one gone into, from elsewhere, such as a canvas, told from being selected. */
export const ISOLATED: InjectionKey<() => readonly string[]> = Symbol('isolated')

/** The types shown whole among layers, with what they are made from under them, which lists what is of them. */
export const SHOWN_WHOLE: InjectionKey<readonly TypeValue[]> = Symbol('shown-whole')

/**
 * What a host does with a click on a row, for what it means to it with the keys held.
 * False if the row is not to be selected after all, as it has only just been left out.
 */
export const ROW_PICKER: InjectionKey<(path: string, event: MouseEvent) => boolean> =
	Symbol('row-picker')

/** The row that starts out open, as what is being looked at. */
export const OPEN_ROW: InjectionKey<() => string | null> = Symbol('open-row')

/** Rows are for reading, so that what they show is a title rather than a name. */
export const TITLED: InjectionKey<boolean> = Symbol('titled')

/**
 * Have the edits that `write` makes be no edits, as opening a row is: the program says it, but
 * there is nothing to undo. Without it, they are edits like any other.
 */
export const QUIETLY: InjectionKey<(write: () => void) => void> = Symbol('glisp-quietly')

/** What a double click on a row does, as it does on what the row draws: true if it did anything. */
export const ROW_DIVER: InjectionKey<(path: string) => boolean> = Symbol('glisp-row-diver')
