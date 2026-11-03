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
import { computed, type ComputedRef, type ShallowRef, shallowRef } from 'vue'

/** Edits this close together undo as one, like a drag on a slider. */
const COALESCE_MS = 500

export interface GlispDocument {
	readonly root: ShallowRef<LetAST>
	readonly diagnostics: ComputedRef<ReadonlyArray<Diagnostic>>
	readonly canUndo: ComputedRef<boolean>
	readonly canRedo: ComputedRef<boolean>
	readonly session: Session
	readonly env: ComputedRef<Env>
	/** Replace the whole program. */
	setRoot(next: LetAST): void
	/** Evaluate a node in its env, sharing the cache with everything else. */
	read(ast: AST, env: Env): EvalResult
	/** Pick up a change the session made by itself, as a REPL does. */
	sync(): void
	undo(): void
	redo(): void
}

export function useGlispDocument(source = '{}'): GlispDocument {
	const session = new Session(buildPrelude())
	const initial = parse(source)
	if (initial.kind === 'let') session.setAst(new LetAST(initial.bindings, null))

	const root = shallowRef(session.ast())
	const past = shallowRef<ReadonlyArray<LetAST>>([])
	const future = shallowRef<ReadonlyArray<LetAST>>([])
	let lastEditAt = 0

	const install = (next: LetAST): void => {
		session.setAst(next)
		root.value = next
	}

	const record = (): void => {
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
		env: computed(() => {
			void root.value
			return session.env
		}),
		diagnostics: computed(() => {
			void root.value
			return check(root.value, session.env).filter(
				d => d.level === 'error'
			)
		}),
		canUndo: computed(() => past.value.length > 0),
		canRedo: computed(() => future.value.length > 0),
		setRoot(next) {
			record()
			install(next)
		},
		read: (ast, env) => session.evalAstIn(ast, env),
		sync() {
			if (session.ast() === root.value) return
			past.value = [...past.value, root.value]
			future.value = []
			lastEditAt = 0
			root.value = session.ast()
		},
		undo() {
			const previous = past.value.at(-1)
			if (previous === undefined) return
			past.value = past.value.slice(0, -1)
			future.value = [...future.value, root.value]
			lastEditAt = 0
			install(previous)
		},
		redo() {
			const next = future.value.at(-1)
			if (next === undefined) return
			future.value = future.value.slice(0, -1)
			past.value = [...past.value, root.value]
			lastEditAt = 0
			install(next)
		},
	}
}
