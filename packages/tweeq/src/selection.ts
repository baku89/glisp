import type { AST } from '@glisp/lang'
import type { InjectionKey, ShallowRef } from 'vue'

/** The slot selected in an editor, and how to delete it, if it can go. */
export interface Selection {
	readonly path: string
	readonly remove?: () => void
	readonly rename?: () => void
	/** Run one of the actions that have a key. */
	readonly evaluate?: (id: 'step' | 'all') => void
}

/** How a row renames the binding it shows, which takes the whole program. */
export interface BindingRenamer {
	can(path: string, name: string): boolean
	apply(path: string, name: string): void
}

export const RENAMER: InjectionKey<BindingRenamer> = Symbol('glisp-renamer')

/** How a row asks for what it shows to come to a value, which takes the whole program. */
export interface BackwardSolver {
	/** Edit the program so that `node` gives `value`, or else say why it cannot be. */
	solve(node: AST, value: unknown): void
}

export const SOLVER: InjectionKey<BackwardSolver> = Symbol('glisp-solver')

/** Opening the rows down to one, and selecting it. */
export interface RowRevealer {
	/** The row to get to, until it has been reached, and whether to rename it there. */
	readonly target: ShallowRef<{ path: string; rename?: boolean } | null>
	/** Where the name at `path` is bound, among the rows. */
	targetOf(path: string): string | null
}

export const REVEALER: InjectionKey<RowRevealer> = Symbol('glisp-revealer')

export const SELECTION: InjectionKey<ShallowRef<Selection | null>> =
	Symbol('glisp-selection')
