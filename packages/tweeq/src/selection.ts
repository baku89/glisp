import type { AST } from '@glisp/lang'
import type { InjectionKey, ShallowRef } from 'vue'

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
	/** The row a reference has been copied of, to paste as a reference to it. */
	readonly copied: ShallowRef<string | null>
}

export const LINKER: InjectionKey<Linker> = Symbol('glisp-linker')

/** An icon for what a row comes to, if a host has one, such as the shape itself. */
export const VALUE_ICON: InjectionKey<(value: unknown) => string | null> =
	Symbol('glisp-value-icon')

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

/** The row that starts out open, as what is being looked at. */
export const OPEN_ROW: InjectionKey<() => string | null> = Symbol('open-row')

/** Rows are for reading, so that what they show is a title rather than a name. */
export const TITLED: InjectionKey<boolean> = Symbol('titled')
