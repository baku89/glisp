import type { InjectionKey, ShallowRef } from 'vue'

/** The slot selected in an editor, and how to delete it, if it can go. */
export interface Selection {
	readonly path: string
	readonly remove?: () => void
}

export const SELECTION: InjectionKey<ShallowRef<Selection | null>> =
	Symbol('glisp-selection')
