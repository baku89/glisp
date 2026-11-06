/**
 * What can be done to rows at the top of a program, as a whole: their order, which is
 * that of the vector the program comes to, and groups, which are vectors of their own.
 */

import { AS_SOURCE, type AST, type Env, CallAST, enterNode, evaluate, hide, infer, isHidden, LetAST, lit, MetaAST, named, nameOf, namedChildrenOf, print, readByName, unhide, unnamed, VecAST, withPathsFollowed, withPathsMoved } from '@glisp/lang'
import { reach, withoutRows, withParent } from '@glisp/tweeq/rowsClipboard'
import { MAIN, isGroup, type Layered, layersOf, layersVectorOf, slotAlong, viewOf, withLayerAdded, withLayersOrdered } from '@glisp/tweeq/structure'
import { bounds } from 'pave/path/metrics'

import { GraphPaperValue, type Path, type Vec } from './graphics'
import type { GraphPaperKind } from './graphPaper'
import { changed, drawOf, gripAt, isVecOfDrawn, labelOfRow, rowWorkedOn, axesCall, axesRowsIn, solidCall, solidRowsIn, graphPaperCall, graphPaperOf, graphPaperRowsIn, isOutlined, paintedIn, sceneOf } from './scene'

const BINDING = 'binding:'

const namesOf = (rows: readonly string[]): Set<string> =>
	new Set(rows.filter(row => !row.includes('/')).map(row => row.slice(BINDING.length)))

/** How a click picks a row: it alone, one more or one less, or all the way from the last one. */
export type Pick = 'only' | 'toggle' | 'range'

/** The rows beside `row` in what holds it, in order, itself among them. */
function siblingsOf(root: AST, env: Env, row: string): readonly string[] {
	const keys = row.split('/')
	const last = keys.pop()!
	let node = root
	let at = env
	for (const key of keys) {
		const slot = viewOf(node, at).slots.find(({ key: other }) => other === key)
		if (slot === undefined) return [row]
		node = slot.ast
		at = slot.env
	}
	const inside = viewOf(node, at).slots.map(({ key }) => key)
	const prefix = keys.length > 0 ? `${keys.join('/')}/` : ''
	return inside.includes(last) ? inside.map(key => `${prefix}${key}`) : [row]
}

/** What is selected, once `row` is picked. Only rows side by side have any range between them. */
export function pickedRows(
	root: AST,
	env: Env,
	selected: readonly string[],
	row: string,
	how: Pick
): readonly string[] {
	if (how === 'only') return [row]
	if (how === 'toggle') {
		return selected.includes(row) ? selected.filter(other => other !== row) : [...selected, row]
	}
	const others = selected.filter(other => other !== row)
	const from = selected.at(-1)
	const siblings = siblingsOf(root, env, row)
	const [start, end] = [from === undefined ? -1 : siblings.indexOf(from), siblings.indexOf(row)]
	if (start < 0) return [...others, row]
	const between = siblings.slice(Math.min(start, end), Math.max(start, end) + 1)
	return [...new Set([...others, ...between.filter(other => other !== row), row])]
}

export type Arrange = 'forward' | 'backward' | 'front' | 'back'

/** `root`, with the rows at its top in another order, the first being in front. */
export function arranged(root: LetAST, rows: readonly string[], how: Arrange): LetAST {
	const names = namesOf(rows)
	const layers = layersOf(root)
	const moving = layers.filter(name => names.has(name))
	const staying = layers.filter(name => !names.has(name))
	if (moving.length === 0) return root
	if (how === 'front') return withLayersOrdered(root, [...moving, ...staying])
	if (how === 'back') return withLayersOrdered(root, [...staying, ...moving])

	// What comes first is in front, so what goes forward goes toward the start.
	const order = how === 'forward' ? [...layers.keys()] : [...layers.keys()].reverse()
	const step = how === 'forward' ? -1 : 1
	for (const i of order) {
		const other = layers[i + step]
		if (!names.has(layers[i]!) || other === undefined || names.has(other)) continue
		layers[i + step] = layers[i]!
		layers[i] = other
	}
	return withLayersOrdered(root, layers)
}

/** How much of the program cannot be worked out, going into groups, as they give nothing. */
const errorsIn = (root: AST, env: Env): number =>
	viewOf(root, env).slots.reduce((count, { key, ast, env: rowEnv }) => {
		if (!key.startsWith(BINDING)) return count
		const node = ast.kind === 'meta' ? ast.expr : ast
		return (
			count +
			(isGroup(node)
				? errorsIn(node, rowEnv)
				: evaluate(readByName(ast), rowEnv).diagnostics.filter(({ level }) => level === 'error')
						.length)
		)
	}, 0)

/** What to call what came from a file, without what such a file says of how it was made. */
const nameFromFile = (fileName: string): string => {
	const stem = fileName
		.replace(/(\.glisp)?(\.svg)?$/i, '')
		.replace(/\.canvas$/i, '')
		.replace(/_\d+dp_.*$/, '')
		.replace(/[^A-Za-z0-9_]+/g, '_')
		.replace(/^[^A-Za-z]+|_+$/g, '')
		.slice(0, MOST_NAME)
	return stem === '' ? 'drawing' : stem
}
const MOST_NAME = 24

/**
 * `root`, with what is in `file` as one more thing in front of all else, its middle at `place`.
 * It is one row, inside of which its names mean what they meant, whatever `root` calls its own.
 * What goes on and on is left behind, being what `root` has of its own. Null if nothing else is drawn.
 */
export function withFileDropped(
	root: LetAST,
	env: Env,
	file: LetAST,
	fileName: string,
	place: Vec
): { readonly ast: LetAST; readonly row: string } | null {
	const canvasWide = [solidRowsIn, graphPaperRowsIn, axesRowsIn].flatMap(rowsIn => [
		...rowsIn(file, env, false),
		...rowsIn(file, env, true),
	])
	const kept = withoutRows(file, env, [...new Set(canvasWide.map(({ row }) => row))]) as LetAST
	if (!sceneOf(kept, env).some(({ draw }) => isOutlined(draw))) return null

	const layered = layersVectorOf(kept)
	const own = kept.bindings.filter(([name]) => name !== layered?.name)
	const [only, ...others] = layered?.vector.elements ?? []
	// One thing drawn, with nothing of its own to refer to, is that thing; anything more, all of it.
	const value = own.length === 0 && only !== undefined && others.length === 0 ? unnamed(only) : groupOf(kept)
	const name = freeName(root, nameFromFile(fileName))
	const row = `binding:${name}`
	const added = withLayerAdded(root, name, value)
	const box = boundsOfRows(added, env, [row])
	if (box === null) return { ast: added, row }
	const [[left, top], [right, bottom]] = box
	const by = [place[0] - (left + right) / 2, place[1] - (top + bottom) / 2].map(n => Math.round(n * 100) / 100)
	return { ast: movedRow(added, env, row, by as unknown as Vec), row }
}

/** `root`, with what is at `row` moved, or each of what it holds if it cannot say so as a whole. */
function movedRow(root: LetAST, env: Env, row: string, by: Vec): LetAST {
	const move = gripAt(root, env, row)?.move
	if (move !== undefined) {
		const { ast } = changed(root, env, row, move(by))
		return ast instanceof LetAST ? ast : root
	}
	const inner = reach(root, env, row)?.chain.at(-1)?.ast
	const block = inner?.kind === 'meta' ? inner.expr : inner
	if (block?.kind !== 'let' && block?.kind !== 'vec') return root
	return layersOf(block).reduce((next, name) => movedRow(next, env, `${row}/${BINDING}${name}`, by), root)
}

/** A name that `root` does not have yet. */
export function freeName(root: AST, stem: string): string {
	const taken = namesIn(root)
	let n = 1
	while (taken.has(`${stem}${n}`)) n++
	return `${stem}${n}`
}

/**
 * The row that says something of the canvas: the last that shows, or else the last that is
 * hidden itself, as a row in something hidden as a whole would say it to no effect.
 */
function rowSaying(
	root: LetAST,
	env: Env,
	rowsIn: (root: AST, env: Env, hidden: boolean) => readonly { row: string }[]
): string | undefined {
	return (
		rowsIn(root, env, false).at(-1)?.row ??
		rowsIn(root, env, true)
			.filter(({ row }) =>
				reach(root, env, row)
					?.chain.slice(0, -1)
					.every(({ ast }) => !isHidden(ast))
			)
			.at(-1)?.row
	)
}

/** What the vector of `block` holds. */
const elementsIn = (block: Layered): readonly AST[] =>
	block.kind === 'vec' ? block.elements : (layersVectorOf(block)?.vector.elements ?? [])

const elementCount = (root: LetAST): number => elementsIn(root).length

/** The key of the row of what is `i`th in the vector of `block`. */
const keyIn = (block: Layered, element: AST, i: number): string => {
	const name = nameOf(element)
	return name !== null ? `${BINDING}${name}` : block.kind === 'vec' ? `${i}` : `element:${i}`
}

/** All the names given anywhere in `ast`, for what is new to be called otherwise. */
function namesIn(ast: AST, into = new Set<string>()): Set<string> {
	const node = ast.kind === 'meta' ? ast.expr : ast
	for (const [name] of namedChildrenOf(node)) into.add(name)
	const children: readonly AST[] =
		node.kind === 'let'
			? [...node.bindings.map(([, value]) => value), ...(node.body === null ? [] : [node.body])]
			: node.kind === 'vec'
				? node.elements
				: node.kind === 'call'
					? [...node.args, ...(node.kwargs?.values() ?? [])]
					: node.kind === 'record'
						? node.fields.flatMap(field => ('kind' in field ? [] : [field[1]]))
						: []
	for (const child of children) namesIn(child, into)
	return into
}

/** What a program from somewhere else comes to as one row: what it draws, with what it has of its own. */
const groupOf = (program: LetAST): AST => {
	const layered = layersVectorOf(program)
	if (layered === null) return program
	const own = program.bindings.filter(([name]) => name !== layered.name)
	return own.length === 0 ? layered.vector : new LetAST(own, layered.vector)
}

/** The place a new graph paper goes: right in front of a solid, which it could not be seen behind, or else the very back. */
function inFrontOfSolid(root: LetAST, env: Env): number {
	const elements = elementsIn(root)
	const behind = new Set(solidRowsIn(root, env, false).map(({ row }) => row))
	const found = elements.findIndex((e, i) => behind.has(keyIn(root, e, i)))
	return found < 0 ? elements.length : found
}

/** `root` with another solid of `color`, at the very back, and the row that says it. */
export function withSolidAdded(root: LetAST, color: string): { ast: LetAST; row: string } {
	const name = freeName(root, 'solid')
	return { ast: withLayerAdded(root, name, solidCall(color), elementCount(root)), row: `${BINDING}${name}` }
}

/**
 * `root` with a solid to choose the color of, and the row that says it: the row that says so
 * already, which comes out of being hidden, and a new one of `color` if there is none.
 */
export function withSolid(
	root: LetAST,
	env: Env,
	color: string
): { ast: LetAST; row: string } {
	const row = rowSaying(root, env, solidRowsIn)
	const reached = row === undefined ? null : reach(root, env, row)
	const last = reached?.chain.at(-1)
	if (row === undefined || !reached || !last) return withSolidAdded(root, color)
	return { ast: withParent(reached.chain, last.replace(unhide(last.ast))) as LetAST, row }
}

/**
 * `root`, showing `kind` of a graph paper, or with it hidden if that is what it shows, so that it
 * comes back in the color and the width it had. It is said by the row that says so already,
 * which comes out of being hidden, and by a new one at the top if there is none. A row in
 * something hidden as a whole would say it to no effect.
 */
export function withGraphPaperToggled(root: LetAST, env: Env, kind: GraphPaperKind): LetAST {
	const row = rowSaying(root, env, graphPaperRowsIn)
	const reached = row === undefined ? null : reach(root, env, row)
	const last = reached?.chain.at(-1)
	if (!reached || !last) {
		return withLayerAdded(root, freeName(root, 'graphPaper'), graphPaperCall(kind), inFrontOfSolid(root, env))
	}
	if (graphPaperOf(root, env)?.kind === kind) return withParent(reached.chain, last.replace(hide(last.ast))) as LetAST
	const said = [...graphPaperRowsIn(root, env, false), ...graphPaperRowsIn(root, env, true)].find(shape => shape.row === row)?.value as GraphPaperValue
	return withParent(reached.chain, last.replace(ofKind(unhide(last.ast), said, kind))) as LetAST
}

/** The row `ast`, which comes to `said`, saying `kind`, and as much of the rest as it did. */
function ofKind(ast: AST, said: GraphPaperValue, kind: GraphPaperKind): AST {
	if (said.kind === kind) return ast
	return ast instanceof CallAST && print(ast.head) === 'graphPaper' && !ast.kwargs?.has('kind')
		? new CallAST(ast.head, [lit(kind), ...ast.args.slice(1)], ast.kwargs)
		: new GraphPaperValue(kind, said.color, said.width, said.origin, said.step, said.adaptive)[AS_SOURCE]()
}

/**
 * `root`, with the axes it has hidden if they show and showing if not, or new ones if it has
 * none. A row in something hidden as a whole would say it to no effect.
 */
export function withAxesToggled(root: LetAST, env: Env): LetAST {
	const row = rowSaying(root, env, axesRowsIn)
	const reached = row === undefined ? null : reach(root, env, row)
	const last = reached?.chain.at(-1)
	if (!reached || !last) return withAxesAdded(root, env).ast
	return withParent(reached.chain, last.replace(isHidden(last.ast) ? unhide(last.ast) : hide(last.ast))) as LetAST
}

/** `root` with axes, where a new graph paper would go, and the row that says them. */
export function withAxesAdded(root: LetAST, env: Env): { ast: LetAST; row: string } {
	const name = freeName(root, 'axes')
	return { ast: withLayerAdded(root, name, axesCall(), inFrontOfSolid(root, env)), row: `${BINDING}${name}` }
}

/** `root` with another graph paper, and the row that says it. */
export function withGraphPaperAdded(root: LetAST, env: Env, kind: GraphPaperKind = 'dots'): { ast: LetAST; row: string } {
	const name = freeName(root, 'graphPaper')
	return {
		ast: withLayerAdded(root, name, graphPaperCall(kind), inFrontOfSolid(root, env)),
		row: `${BINDING}${name}`,
	}
}

/** How a path from the root goes to what `block` holds, if it is the program's own. */
const levelsTo = (root: AST, block: Layered): readonly string[] => {
	const layered = root === block && block.kind === 'let' ? layersVectorOf(block) : null
	return layered?.name ? [layered.name] : []
}

/**
 * `block`, with the rows in a group of their own, where the frontmost of them was. Null with
 * nothing to group, or if that would leave anything not coming to what it did: a path
 * counts how far it goes, so one that goes in or out of the group no longer gets there.
 */
function groupedIn<B extends Layered>(
	block: B,
	env: Env,
	rows: readonly string[],
	levels: readonly string[]
): { ast: B; row: string } | null {
	const names = namesOf(rows)
	const elements = elementsIn(block)
	const isMember = (element: AST) => names.has(nameOf(element) ?? '')
	const members = elements.filter(isMember)
	if (members.length === 0) return null
	const name = freeName(block, 'group')
	const first = elements.findIndex(isMember)
	const held = elements.flatMap((element, i) =>
		i === first ? [named(name, new VecAST(members))] : isMember(element) ? [] : [element]
	)
	const placed = withElementsIn(block, held)
	const movedFromRoot = members.reduce<AST>((moved, member) => {
		const called = nameOf(member)!
		return withPathsMoved(moved, env, [...levels, called], [...levels, name, called])
	}, placed)
	// What a path reached, it goes on reaching, however many levels away it is now.
	const ast = withPathsFollowed(block, movedFromRoot, env) as B
	return errorsIn(ast, env) > errorsIn(block, env) ? null : { ast, row: `${BINDING}${name}` }
}

/** `block`, holding `elements` in its vector. */
function withElementsIn<B extends Layered>(block: B, elements: readonly AST[]): B {
	if (block.kind === 'vec') return new VecAST(elements) as B
	const layered = layersVectorOf(block)
	return (layered === null ? new LetAST(block.bindings, new VecAST(elements)) : layered.with(new VecAST(elements))) as B
}

/**
 * What a call that comes to a path is made from, among what it is given, without the call: each
 * under the style that was around it, which is what it was drawn by, as what is in it goes for
 * nothing there. Null if it is made from no path, or is nothing of the kind.
 */
function madeFrom(value: AST, env: Env): readonly AST[] | null {
	const outer = value.kind === 'meta' ? value.expr : value
	const styled = outer.kind === 'call' && print(outer.head) === 'style' ? outer : null
	const wrapped = styled === null ? outer : styled.args[0]
	const call = wrapped?.kind === 'meta' ? wrapped.expr : wrapped
	if (call?.kind !== 'call' || print(call.head) === 'style') return null
	const inside = enterNode(call, env)
	if (drawOf(infer(call, env)) !== 'path') return null
	const given = [...call.args, ...(call.kwargs?.values() ?? [])]
	const paths = given.filter(arg => drawOf(infer(arg, inside)) === 'path')
	if (paths.length === 0) return null
	return paths.map(path => {
		if (styled === null) return path
		const bare = path.kind === 'meta' ? path.expr : path
		const within = bare.kind === 'call' && print(bare.head) === 'style' ? bare.args[0]! : path
		return new CallAST(styled.head, [within, ...styled.args.slice(1)], styled.kwargs)
	})
}

/** Whether what is at `row` is made from a path, which ungrouping it would leave of it. */
export function isMadeFromPaths(root: AST, env: Env, row: string): boolean {
	const slot = slotAlong(root, env, row.split('/'))
	return slot !== null && slot !== undefined && madeFrom(slot.ast, slot.env) !== null
}

/** What a row of `value` goes by, as what it is made by. */
const stemOf = (value: AST): string => {
	const call = value.kind === 'meta' ? value.expr : value
	if (call.kind !== 'call') return 'path'
	const head = print(call.head) === 'style' ? stemOf(call.args[0]!) : print(call.head)
	return head.slice(head.lastIndexOf('.') + 1)
}

/**
 * `block`, with the groups among the rows let go of, what was in them being where they
 * were. Null if none of them is one, or what is in one would no longer come to the same.
 */
function ungroupedIn<B extends Layered>(
	block: B,
	env: Env,
	rows: readonly string[],
	levels: readonly string[]
): { ast: B; rows: string[] } | null {
	const { slots } = viewOf(block, env)
	const envOf = (key: string): Env => slots.find(slot => slot.key === key)?.env ?? env
	const elements = elementsIn(block)
	const taken = new Set(elements.flatMap(element => nameOf(element) ?? []))
	const moves: (readonly [readonly string[], readonly string[]])[] = []
	const out: { ast: AST; freed: boolean }[] = []
	// What the block only binds, which what is let go of may come to draw.
	const layered = block.kind === 'let' ? layersVectorOf(block) : null
	const own = new Map(block.kind === 'let' ? block.bindings.filter(([bound]) => bound !== layered?.name) : [])
	const moved = new Set<string>()
	let changed = false
	/** A name for what is let go of, of its own, as near what it was called as can be. */
	const fresh = (stem: string): string => {
		let n = 1
		while (taken.has(`${stem}${n}`)) n++
		taken.add(`${stem}${n}`)
		return `${stem}${n}`
	}
	elements.forEach((element, i) => {
		const key = keyIn(block, element, i)
		const name = nameOf(element)
		const value = name === null ? element : unnamed(element)
		if (!rows.includes(key)) {
			out.push({ ast: element, freed: false })
			return
		}
		const node = value.kind === 'meta' ? value.expr : value
		const inner = node.kind === 'let' ? layersVectorOf(node) : null
		// A group, with nothing of its own, goes where it was, what is in it keeping its names.
		const group = node.kind === 'vec' && isGroup(node) ? node : inner !== null && node.kind === 'let' && node.bindings.length === (inner.name === null ? 0 : 1) ? inner.vector : null
		if (group !== null) {
			const clashes = group.elements.some(each => {
				const called = nameOf(each)
				return called !== null && called !== name && taken.has(called)
			})
			if (!clashes) {
				if (name !== null) taken.delete(name)
				for (const each of group.elements) {
					const called = nameOf(each)
					if (called !== null) {
						taken.add(called)
						if (name !== null) moves.push([[...levels, name, called], [...levels, called]])
					}
					out.push({ ast: each, freed: true })
				}
				changed = true
				return
			}
		}
		// What a spray comes to, a vector of what each draws with no names, goes where it was.
		if (node.kind === 'vec' && isVecOfDrawn(node, envOf(key))) {
			for (const each of node.elements) out.push({ ast: each, freed: true })
			changed = true
			return
		}
		const made = madeFrom(value, envOf(key))
		if (made === null) {
			out.push({ ast: element, freed: false })
			return
		}
		changed = true
		// One of them goes on being what it was, for all that refers to it by name.
		if (made.length === 1 && name !== null) {
			const [only] = made
			out.push({ ast: named(name, value.kind === 'meta' ? new MetaAST(value.metadata, only!) : only!), freed: true })
			return
		}
		if (name !== null) taken.delete(name)
		for (const path of made) {
			if (path.kind === 'sym') {
				// What is drawn already is not drawn twice for having been made into this.
				const isDrawn = (each: AST) => nameOf(each) === path.name
				if (elements.some(isDrawn) || out.some(({ ast }) => isDrawn(ast))) continue
				// What is only bound, and is referred to, comes to be drawn where it is, by its name.
				const value = own.get(path.name)
				if (value !== undefined && !moved.has(path.name)) {
					moved.add(path.name)
					out.push({ ast: named(path.name, value), freed: true })
					continue
				}
			}
			out.push({ ast: name === null ? path : named(fresh(path.kind === 'sym' ? path.name : stemOf(path)), path), freed: true })
		}
	})
	if (!changed) return null
	const holding = withElementsIn(
		block,
		out.map(({ ast }) => ast)
	)
	const placed = (
		holding.kind === 'let' && moved.size > 0
			? new LetAST(holding.bindings.filter(([bound]) => !moved.has(bound)), holding.body)
			: holding
	) as B
	const freed = out.flatMap(({ ast, freed }, i) => (freed ? [keyIn(block, ast, i)] : []))
	const movedFromRoot = moves.reduce<AST>((moved, [from, to]) => withPathsMoved(moved, env, from, to), placed)
	const ast = withPathsFollowed(block, movedFromRoot, env) as B
	return freed.length === 0 || errorsIn(ast, env) > errorsIn(block, env) ? null : { ast, rows: freed }
}

const parentOf = (row: string): string => row.slice(0, Math.max(0, row.lastIndexOf('/')))
const keyOf = (row: string): string => row.slice(row.lastIndexOf('/') + 1)
const inParent = (parent: string, row: string): string => (parent === '' ? row : `${parent}/${row}`)

/**
 * `root`, with `act` done to the block at the row `parent`, wherever that is, and what else it
 * says. Null if there is no block there, or nothing comes of it.
 */
function inBlock<R extends { readonly ast: Layered }>(
	root: LetAST,
	env: Env,
	parent: string,
	act: (block: Layered, blockEnv: Env, levels: readonly string[]) => R | null
): (Omit<R, 'ast'> & { readonly ast: LetAST }) | null {
	if (parent === '') {
		const result = act(root, env, levelsTo(root, root))
		return result === null ? null : { ...result, ast: result.ast as LetAST }
	}
	const slot = slotAlong(root, env, parent.split('/'))
	const block = slot?.ast.kind === 'meta' ? slot.ast.expr : slot?.ast
	if (!slot || !(block instanceof LetAST || block instanceof VecAST)) return null
	const result = act(block, slot.env, [])
	if (result === null) return null
	const next = slot.ast.kind === 'meta' ? new MetaAST(slot.ast.metadata, result.ast) : result.ast
	return { ...result, ast: slot.replace(next) as LetAST }
}

/** `rows`, all in the one block, in a group of their own there. Null if they are not in one. */
export function grouped(
	root: LetAST,
	env: Env,
	rows: readonly string[]
): { ast: LetAST; row: string } | null {
	const parent = parentOf(rows[0] ?? '')
	if (rows.some(row => parentOf(row) !== parent)) return null
	const result = inBlock(root, env, parent, (block, blockEnv, levels) => groupedIn(block, blockEnv, rows.map(keyOf), levels))
	if (result === null || errorsIn(result.ast, env) > errorsIn(root, env)) return null
	return { ast: result.ast, row: inParent(parent, result.row) }
}

/** `root`, with the groups among `rows` let go of, in whatever block each of them is. */
export function ungrouped(
	root: LetAST,
	env: Env,
	rows: readonly string[]
): { ast: LetAST; rows: string[] } | null {
	// From the deepest, for there still being the way to what is further out.
	const parents = [...new Set(rows.map(parentOf))].sort((a, b) => b.length - a.length)
	let ast = root
	const freed: string[] = []
	for (const parent of parents) {
		const keys = rows.filter(row => parentOf(row) === parent).map(keyOf)
		const result = inBlock(ast, env, parent, (block, blockEnv, levels) => ungroupedIn(block, blockEnv, keys, levels))
		if (result === null) continue
		ast = result.ast
		freed.push(...result.rows.map(row => inParent(parent, row)))
	}
	return freed.length === 0 || errorsIn(ast, env) > errorsIn(root, env) ? null : { ast, rows: freed }
}

/** The rows that draw anything, once each, in the order they are drawn. */
export const drawnRows = (root: AST, env: Env): string[] => [
	...new Set(sceneOf(root, env).map(({ row }) => row)),
]

/** The rows of all that is drawn in the end, what goes on and on too. */
export const allPaintedRows = (root: AST, env: Env): string[] => [
	...new Set(paintedIn(root, env).map(({ row }) => row)),
]

/**
 * What an export of `drawings` has in it: them, and all that goes on and on, each where it is
 * among the layers as on the canvas. With no drawings, it is all there is.
 */
export function exportedRows(root: AST, env: Env, drawings: readonly string[]): string[] {
	const painted = [...paintedIn(root, env)].reverse()
	const asked = drawings.length > 0 ? drawings : painted.filter(({ draw }) => draw === 'path').map(({ row }) => row)
	const behind = painted.filter(({ draw }) => draw !== 'path').map(({ row }) => row)
	return [...new Set([...asked, ...behind])]
}

/** The corners around what `rows` draw, or all there is. Null if that is nothing. */
export function boundsOfRows(
	root: AST,
	env: Env,
	rows?: readonly string[]
): readonly [Vec, Vec] | null {
	let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity]
	for (const { row, draw, value } of sceneOf(root, env)) {
		// A line goes on for ever, so it has no size to go by.
		if (draw === 'line') continue
		if (rows && !rows.some(path => row === path || row.startsWith(`${path}/`))) continue
		const [[l, t], [r, b]] =
			isOutlined(draw) ? bounds(value as Path) : [value as Vec, value as Vec]
		left = Math.min(left, l)
		top = Math.min(top, t)
		right = Math.max(right, r)
		bottom = Math.max(bottom, b)
	}
	return Number.isFinite(left) ? [[left, top], [right, bottom]] : null
}

/** What is free of the panels on a screen, as `[left, top, right, bottom]`. */
export type Area = readonly [number, number, number, number]

/** How the program is on a screen, as a `mat2d`, which only goes in and across. */
export type View = readonly [number, number, number, number, number, number]

const MAX_FIT_ZOOM = 8

/** The view that has `box` as large as it can be in `area`, in the middle of it. */
export function viewToFit(
	[[left, top], [right, bottom]]: readonly [Vec, Vec],
	[areaLeft, areaTop, areaRight, areaBottom]: Area
): [number, number, number, number, number, number] {
	const [width, height] = [right - left, bottom - top]
	const [areaWidth, areaHeight] = [areaRight - areaLeft, areaBottom - areaTop]
	const zoom = Math.min(
		width > 0 ? areaWidth / width : MAX_FIT_ZOOM,
		height > 0 ? areaHeight / height : MAX_FIT_ZOOM,
		MAX_FIT_ZOOM
	)
	return [
		zoom,
		0,
		0,
		zoom,
		areaLeft + areaWidth / 2 - (zoom * (left + right)) / 2,
		areaTop + areaHeight / 2 - (zoom * (top + bottom)) / 2,
	]
}

/**
 * The view `t` of the way from one to another. How far in goes by ratio, so that each doubling
 * takes as long, and what is on screen goes straight, as it does around one point when zooming.
 */
export function viewBetween(
	[zoomA, , , , ax, ay]: View,
	[zoomB, , , , bx, by]: View,
	t: number
): View {
	const zoom = zoomA * (zoomB / zoomA) ** t
	const along = Math.abs(zoomB - zoomA) < 1e-9 ? t : (zoom - zoomA) / (zoomB - zoomA)
	return [zoom, 0, 0, zoom, ax + (bx - ax) * along, ay + (by - ay) * along]
}

/**
 * What `selected` is about: the row kept hold of, with only parts of that selected, which are
 * then what is picked out of it.
 */
export const rowsAbout = (selected: readonly string[], kept: string | null): readonly string[] =>
	kept !== null && selected.length > 0 && selected.every(row => row.startsWith(`${kept}/`))
		? [kept]
		: selected

/** The name of the binding that a row is, if it is one. */
export function nameOfRow(row: string): string | null {
	const key = row.split('/').at(-1)!
	return key.startsWith(BINDING) ? key.slice(BINDING.length) : null
}

/** One level of what has been gone into, to be told of and gone back to. */
export interface Crumb {
	readonly row: string
	readonly label: string
	/** The rows gone through by the time this is what is isolated. */
	readonly through: readonly string[]
}

/**
 * The levels that the rows gone through come to. A row and what it only stands for, as a style
 * stands for what it is given and a name for what it refers to, are one and the same level.
 */
export function crumbsOf(root: AST, env: Env, gone: readonly string[]): Crumb[] {
	const crumbs: Crumb[] = []
	gone.forEach((row, i) => {
		const last = crumbs.at(-1)
		if (last !== undefined && rowWorkedOn(root, env, last.through.at(-1)!) === row) {
			crumbs[crumbs.length - 1] = { ...last, through: gone.slice(0, i + 1) }
		} else {
			const label = nameOfRow(row) ?? labelOfRow(root, env, row) ?? row
			crumbs.push({ row, label, through: gone.slice(0, i + 1) })
		}
	})
	return crumbs
}

/** The row of the same binding, once it has been called `name`. */
export function rowCalled(row: string, name: string): string {
	return [...row.split('/').slice(0, -1), BINDING + name].join('/')
}
