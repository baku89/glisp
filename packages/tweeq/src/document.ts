/**
 * A program being edited through a GUI: one let-block, with undo, reading values
 * through the session's `Runtime`. Reactive through a `shallowRef`, so a widget
 * re-renders when the root it depends on changes.
 */

import {
	type AST,
	buildPrelude,
	check,
	type Diagnostic,
	type Env,
	type EvalResult,
	LetAST,
	parse,
	Session,
} from '@glisp/lang'

import { withIcons } from './icons'
import { computed, type ComputedRef, type ShallowRef, shallowRef } from 'vue'

/** Edits this close together undo as one, like a drag on a slider. */
const COALESCE_MS = 500

/** All there is to a program being edited, undo included, to come back to. */
export interface DocumentState {
	readonly root: LetAST
	readonly past: ReadonlyArray<LetAST>
	readonly future: ReadonlyArray<LetAST>
}

export interface GlispDocument {
	readonly root: ShallowRef<LetAST>
	readonly diagnostics: ComputedRef<ReadonlyArray<Diagnostic>>
	readonly canUndo: ComputedRef<boolean>
	readonly canRedo: ComputedRef<boolean>
	readonly session: Session
	readonly env: ComputedRef<Env>
	/** The row a reference has been copied of, and what is on the clipboard for it. */
	readonly copiedReference: ShallowRef<{ readonly path: string; readonly written: string } | null>
	/** Replace the whole program. */
	setRoot(next: LetAST): void
	/**
	 * Replace the whole program by what is no edit of it, as a row being opened is: not a step
	 * of its own to undo, nor the end of the one before it.
	 */
	adjust(next: LetAST): void
	/** Have every `setRoot` that `write` makes undo as one. */
	batch(write: () => void): void
	/** Have every `setRoot` from now until `release` undo as one, as typing in a field does. */
	hold(): void
	release(): void
	/** Evaluate a node in its env, sharing the cache with everything else. */
	read(ast: AST, env: Env): EvalResult
	/** Pick up a change the session made by itself, as a REPL does. */
	sync(): void
	undo(): void
	redo(): void
	/** Go back to `to`, a program it has been, as if nothing since had happened. */
	rewind(to: LetAST): void
	/** What is being edited as it is, for `resume` to come back to. */
	state(): DocumentState
	/** Go over to editing something else, as it was left, which is not an edit of what this was. */
	resume(state: DocumentState): void
}

export function useGlispDocument(
	source = '{}',
	/** What a host adds to the language, which the program can then refer to. */
	options: { env?: (prelude: Env) => Env } = {}
): GlispDocument {
	const prelude = withIcons(buildPrelude())
	const session = new Session(options.env?.(prelude) ?? prelude)
	const initial = parse(source)
	if (initial.kind === 'let') session.setAst(initial)

	const root = shallowRef(session.ast())
	const past = shallowRef<ReadonlyArray<LetAST>>([])
	const future = shallowRef<ReadonlyArray<LetAST>>([])
	let lastEditAt = -Infinity
	let batching = false
	let recorded = false
	let held = false
	const copiedReference: GlispDocument['copiedReference'] = shallowRef(null)

	const install = (next: LetAST): void => {
		session.setAst(next)
		root.value = next
	}

	const record = (): void => {
		if (recorded) return
		recorded = batching || held
		const now = performance.now()
		if (now - lastEditAt > COALESCE_MS) {
			past.value = [...past.value, root.value]
		}
		lastEditAt = now
		future.value = []
	}

	return {
		root,
		session,
		copiedReference,
		env: computed(() => {
			void root.value
			return session.hostEnv
		}),
		diagnostics: computed(() => {
			void root.value
			return check(root.value, session.hostEnv).filter(
				d => d.level === 'error'
			)
		}),
		canUndo: computed(() => past.value.length > 0),
		canRedo: computed(() => future.value.length > 0),
		setRoot(next) {
			record()
			install(next)
		},
		adjust: install,
		batch(write) {
			if (batching) return write()
			batching = true
			try {
				write()
			} finally {
				batching = false
				if (!held) recorded = false
			}
		},
		hold() {
			if (held) return
			held = true
			recorded = false
			// What comes next is not more of what came just before.
			lastEditAt = -Infinity
		},
		release() {
			held = recorded = false
			lastEditAt = -Infinity
		},
		read: (ast, env) => session.evalAstIn(ast, env),
		sync() {
			if (session.ast() === root.value) return
			past.value = [...past.value, root.value]
			future.value = []
			lastEditAt = -Infinity
			root.value = session.ast()
		},
		undo() {
			const previous = past.value.at(-1)
			if (previous === undefined) return
			past.value = past.value.slice(0, -1)
			future.value = [...future.value, root.value]
			lastEditAt = -Infinity
			recorded = false
			install(previous)
		},
		state: () => ({ root: root.value, past: past.value, future: future.value }),
		resume(state) {
			past.value = state.past
			future.value = state.future
			lastEditAt = -Infinity
			batching = held = recorded = false
			copiedReference.value = null
			install(state.root)
		},
		rewind(to) {
			if (root.value === to) return
			const at = past.value.lastIndexOf(to)
			if (at >= 0) past.value = past.value.slice(0, at)
			lastEditAt = -Infinity
			recorded = false
			install(to)
		},
		redo() {
			const next = future.value.at(-1)
			if (next === undefined) return
			future.value = future.value.slice(0, -1)
			past.value = [...past.value, root.value]
			lastEditAt = -Infinity
			recorded = false
			install(next)
		},
	}
}
