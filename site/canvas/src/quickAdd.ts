/**
 * What can be added from where the pointer is, by searching what the program can see: a
 * shape goes around the pointer, and anything else starts as what it would at first. On a
 * canvas that is what gives something drawn. Where a value is selected, it is what can go
 * there instead.
 */

import {
	type AST,
	CallAST,
	check,
	type Env,
	evaluate,
	type GlispClosure,
	isGlispClosure,
	isTypeValue,
	isTypedHostFn,
	type TypedHostFn,
	LetAST,
	MetaAST,
	parse,
	PathAST,
	pushLetFrame,
	resolveTypeSlot,
	SymAST,
	toAst,
	typeFits,
	type TypeValue,
	unwrapLazy,
	VecAST,
} from '@glisp/lang'
import { callOf, type Filter, filtersFor, functionsIn, functionsOfProgram, wrappedAt } from '@glisp/tweeq/filters'
import { reach, withParent } from '@glisp/tweeq/rowsClipboard'
import { defaultFor, referenceAt, withLayerAdded } from '@glisp/tweeq/structure'

import { isPath, isStyled, type Vec } from './graphics'
import { freeName, withAxesAdded, withGraphPaperAdded, withSolidAdded } from './rows'
import { type Place, placeOf, writtenAt, whereIs } from './place'
import { attached, drawOf, gripAt, paintedIn, workedOutAt } from './scene'

export interface Addable {
	/** As it is written, like `path.circle`. */
	readonly name: string
	readonly label: string
	readonly group: string
	/** It is there to be asked for, and is not listed with nothing asked. */
	readonly quiet?: boolean
	/** It is a row of its own, and does not take what is selected, whatever that is. */
	readonly alone?: boolean
}

/** In the order they are listed, with what is more to do with drawing first. */
const GROUPS = ['Wrap', 'Project', 'Shapes', 'Guides', 'Canvas', 'Path', 'Color', 'Vector', 'Matrix', 'Math', 'List', 'Text', 'Other'] as const

const MODULES: Readonly<Record<string, (typeof GROUPS)[number]>> = {
	color: 'Color',
	vec2: 'Vector',
	mat2d: 'Matrix',
}

/** The arguments of what is a shape, around the place it is at, big enough to be seen. */
const SHAPES: Readonly<Record<string, (x: number, y: number) => string>> = {
	'path.circle': (x, y) => `[${x} ${y}] 50`,
	'path.ellipse': (x, y) => `[${x} ${y}] [60 40]`,
	'path.ellipseFromFoci': (x, y) => `[${x - 30} ${y}] [${x + 30} ${y}] [${x} ${y - 40}]`,
	'path.rect': (x, y) => `[${x - 50} ${y - 50}] [100 100]`,
	'path.square': (x, y) => `[${x - 50} ${y - 50}] 100`,
	'path.qr': (x, y) => `[${x - 50} ${y - 50}] 100 "https://glisp.app"`,
	'path.roundRect': (x, y) => `[${x - 50} ${y - 50}] [100 100] 12`,
	'path.superellipse': (x, y) => `[${x} ${y}] [50 50] 2`,
	'path.line': (x, y) => `[${x - 50} ${y}] [${x + 50} ${y}]`,
	'path.polyline': (x, y) => `[${x - 50} ${y + 30}] [${x} ${y - 30}] [${x + 50} ${y + 30}]`,
	'path.polygon': (x, y) => `[${x - 50} ${y + 30}] [${x} ${y - 30}] [${x + 50} ${y + 30}]`,
	'path.cubic': (x, y) => `[${x - 50} ${y}] [${x - 20} ${y - 50}] [${x + 20} ${y + 50}] [${x + 50} ${y}]`,
	'path.ngon': (x, y) => `[${x} ${y}] 50 5`,
	'path.star': (x, y) => `[${x} ${y}] 50 22 5`,
	'path.capsule': (x, y) => `[${x - 40} ${y}] [${x + 40} ${y}] 18`,
	'path.arc': (x, y) => `[${x} ${y}] 50 0 270`,
	'path.arcThrough': (x, y) => `[${x - 50} ${y}] [${x} ${y - 50}] [${x + 50} ${y}]`,
	'path.fan': (x, y) => `[${x} ${y}] 25 50 -45 45`,
	'path.spiral': (x, y) => `[${x} ${y}] 0 50 3`,
	'path.clothoid': (x, y) => `[${x} ${y}] 0 100 0 0.03`,
}

/** What is not itself a shape, but starts around the place it is added at, to be seen there. */
const STARTS_AROUND: Readonly<Record<string, (x: number, y: number) => string>> = {
	'path.repeatAlong': (x, y) => `(path.circle [${x} ${y}] 100) (path.circle [0 0] 10)`,
}

/**
 * What is not part of what is drawn, but is there to see by and to refer to, as it is
 * written around a place, and what a row of it is called.
 */
const GUIDES: Readonly<
	Record<
		string,
		{
			readonly label: string
			readonly stem: string
			/** How many of its first arguments are places, which a selected point can be. */
			readonly places?: number
			code(x: number, y: number, given: number): string
		}
	>
> = {
	// Onto a point that is selected, which it refers to, as it would be let go there.
	point: { label: 'Point', stem: 'point', places: 1, code: (x, y) => `^point [${x} ${y}]` },
	'vec2.lerp': {
		label: 'Lerp',
		stem: 'lerp',
		places: 2,
		// From a point, it goes on toward where it is asked for.
		code: (x, y, given) =>
			given === 0 ? `(vec2.lerp [${x - 50} ${y}] [${x + 50} ${y}] 0.5)` : `(vec2.lerp [${x} ${y}] [${x} ${y}] 0.5)`,
	},
	'vec2.midpoint': {
		label: 'Midpoint',
		stem: 'midpoint',
		places: 2,
		// From a point, it is halfway to where it is asked for, and so goes on as far again.
		code: (x, y, given) =>
			given === 0 ? `(vec2.midpoint [${x - 50} ${y}] [${x + 50} ${y}])` : `(vec2.midpoint [${x} ${y}] [${x} ${y}])`,
	},
	'vec2.nudge': {
		label: 'Nudge',
		stem: 'nudge',
		places: 1,
		code: (x, y) => `(vec2.nudge [${x} ${y}] [50 0])`,
	},
	'vec2.reflect': {
		label: 'Reflect',
		stem: 'reflect',
		places: 1,
		// Across an upright line a little to the right of it, for its image to be seen apart from it.
		code: (x, y) => `(vec2.reflect [${x} ${y}] (line.fromPoints [${x + 50} ${y - 50}] [${x + 50} ${y + 50}]))`,
	},
	'line.fromPoints': {
		label: 'Line Through Points',
		stem: 'line',
		places: 2,
		// From a point, it goes on through where it is asked for.
		code: (x, y, given) =>
			given === 0
				? `(line.fromPoints [${x} ${y - 50}] [${x} ${y + 50}])`
				: `(line.fromPoints [${x} ${y}] [${x} ${y}])`,
	},
	'line.at': { label: 'Line at an Angle', stem: 'line', places: 1, code: (x, y) => `(line.at [${x} ${y}] 90)` },
	'line.horizontal': { label: 'Horizontal Line', stem: 'line', places: 1, code: (x, y) => `(line.horizontal [${x} ${y}])` },
	'line.vertical': { label: 'Vertical Line', stem: 'line', places: 1, code: (x, y) => `(line.vertical [${x} ${y}])` },
	'ray.fromPoints': {
		label: 'Ray Through Points',
		stem: 'ray',
		places: 2,
		// From a point, it goes on through where it is asked for.
		code: (x, y, given) =>
			given === 0 ? `(ray.fromPoints [${x} ${y}] [${x + 100} ${y}])` : `(ray.fromPoints [${x} ${y}] [${x} ${y}])`,
	},
	'ray.at': { label: 'Ray at an Angle', stem: 'ray', places: 1, code: (x, y) => `(ray.at [${x} ${y}] 0)` },
	rect: {
		label: 'Rect',
		stem: 'rect',
		places: 1,
		code: (x, y) => `(rect [${x - 50} ${y - 50}] [100 100])`,
	},
}

/**
 * Of what is selected, the points, as what is not a function of the host but takes them first goes
 * by: rows drawn as points, and parts that are wanted as points, as a vertex of a polyline is.
 */
function pointsSelected(root: LetAST, env: Env, selected: readonly string[]): string[] {
	const drawn = paintedIn(root, env)
	const points = new Set(drawn.filter(({ draw }) => draw === 'point').map(({ row }) => row))
	const rows = new Set(drawn.map(({ row }) => row))
	// What a part is wanted as, as a vertex of a polyline is a point but the size of a rect is not.
	const isPoint = (path: string): boolean => {
		const expected = reach(root, env, path)?.chain.at(-1)?.expected
		return expected != null && drawOf(expected) === 'point'
	}
	return selected.filter(path => points.has(path) || (!rows.has(path) && isPoint(path)))
}

function withReferences(root: LetAST, env: Env, row: string, given: ReadonlyMap<number, string>): LetAST {
	return [...given].reduce<LetAST>((ast, [i, of]) => {
		const next = referredTo(ast, env, `${row}/arg${i}`, of) ?? (i === 0 ? castReferring(ast, env, row, of) : null)
		return next instanceof LetAST ? next : ast
	}, root)
}

/**
 * `root` with the row at `row`, a value cast as something, as `^point [x y]` is, being what is at
 * `of` cast as that: what it is cast as can only be referred through as a whole.
 */
function castReferring(root: LetAST, env: Env, row: string, of: string): AST | null {
	const written = reach(root, env, row)?.chain.at(-1)?.ast
	const cast = written?.kind === 'meta' ? written.expr : written
	if (!(cast instanceof CallAST) || cast.head.kind !== 'sym' || cast.head.name !== '^') return null
	const referred = referenceAt(root, env, row, of)
	const reference = referred && reach(referred, env, row)?.chain.at(-1)?.ast
	if (!referred || !reference) return null
	const [, ...rest] = cast.args
	const bareReference = reference.kind === 'meta' ? reference.expr : reference
	// Written in what it is cast as, a path starts a level further in, and so goes up one more.
	const within =
		bareReference instanceof PathAST && bareReference.segments[0] !== '/'
			? new PathAST(['..', ...bareReference.segments])
			: bareReference
	return inPlace(referred, env, row, new CallAST(cast.head, [within, ...rest], cast.kwargs))
}

/**
 * Of what is selected, what goes in which argument of `fn`: each in the first one left of its
 * type, so that of several of a type, the one selected first comes first. Where every argument
 * it has to be given is, and one more is left that is of what `fn` gives, that is where what it
 * gives goes, as a point made the image of another across a line is: the one of its type selected
 * last. Where the selection is, among the rest of what is selected, does not matter.
 */
function selectionFor(
	root: AST,
	env: Env,
	fn: TypedHostFn,
	selected: readonly string[]
): { given: ReadonlyMap<number, string>; into: string | null } {
	const says = (type: TypeValue | undefined): type is TypeValue => type !== undefined && type.typeName !== '_'
	const values = selected.flatMap(path => {
		const value = valueAt(root, env, path)
		return value === undefined ? [] : [{ path, value }]
	})
	const given = new Map<number, string>()
	const left: typeof values = []
	for (const one of values) {
		const arg = fn.paramTypes.findIndex((type, j) => !given.has(j) && says(type) && type.fits(one.value))
		if (arg >= 0) given.set(arg, one.path)
		else left.push(one)
	}
	// What none of it could be, as a ratio is not a point, starts as it would.
	const needed = fn.paramTypes.every((type, j) => given.has(j) || !says(type) || !values.some(({ value }) => type.fits(value)))
	const [extra] = left
	const into = needed && left.length === 1 && says(fn.returnType) && fn.returnType.fits(extra!.value) ? extra!.path : null
	return { given, into }
}

const errorsOf = (ast: AST, env: Env): number =>
	errorsIn(ast, env) + evaluate(ast, env).diagnostics.filter(({ level }) => level === 'error').length

/**
 * `root` with `call` at `path`, in place of what was there, and referring to what is at each
 * path of `given` for that argument: so that what was there goes on being what `call` makes of
 * them. Null if it cannot, as where it would come back to itself.
 */
function withCallInto(root: LetAST, env: Env, path: string, call: AST, given: ReadonlyMap<number, string>): LetAST | null {
	let next = inPlace(root, env, path, call)
	for (const [i, of] of given) {
		if (next === null) return null
		next = referredTo(next, env, `${path}/arg${i}`, of)
	}
	return next instanceof LetAST && errorsOf(next, env) <= errorsOf(root, env) ? next : null
}

/** What says something of the canvas, of which there is one to see, wherever it is asked for. */
const OF_CANVAS: readonly Addable[] = [
	{ name: 'solid', label: 'Solid', group: 'Canvas', alone: true },
	{ name: 'graphPaper', label: 'Graph Paper', group: 'Canvas', alone: true },
	{ name: 'axes', label: 'Axes', group: 'Canvas', alone: true },
]
/** What a solid is at first, until it is chosen. */
const SOLID_COLOR = '#ffffff'

const groupOf = ({ name, fn }: Filter): string => {
	if (name in SHAPES) return 'Shapes'
	const module = name.includes('.') ? name.slice(0, name.indexOf('.')) : null
	if (module === 'path') return 'Path'
	if (module !== null) return MODULES[module] ?? 'Other'
	const returned = fn.returnType?.typeName
	return returned === 'number' || returned === 'boolean'
		? 'Math'
		: returned === 'string'
			? 'Text'
			: returned === 'vector'
				? 'List'
				: 'Other'
}

const rankOfGroup = (group: string): number => {
	const at = (GROUPS as readonly string[]).indexOf(group)
	return at < 0 ? GROUPS.length : at
}

/** What a program can see that it says itself, or else has been given, nearest first. */
function closuresIn(root: LetAST, env: Env): readonly (readonly [string, GlispClosure, boolean])[] {
	const found = new Map<string, readonly [string, GlispClosure, boolean]>()
	const program = pushLetFrame(root, env)
	for (let frame: Env = program; frame !== null; frame = frame.parent) {
		for (const [name, { ast, env: bound }] of frame.bindings ?? []) {
			if (found.has(name) || ast.kind === 'host') continue
			const { value } = evaluate(ast, bound)
			if (isGlispClosure(value)) found.set(name, [name, value, frame === program])
		}
	}
	return [...found.values()]
}

/** A place, as two numbers that are not said to be anything else, such as a size. */
const isPlace = (type: ReturnType<typeof resolveTypeSlot>): boolean => {
	if (type?.shape.kind !== 'tuple' || !type.fits([0, 0])) return false
	const said = type.meta?.get('name')
	return said === undefined || (said.kind === 'lit' && said.value === 'point')
}

/**
 * `call` of `fn`, going through `at` by what it is not given: the first place is `at`, and each
 * line goes through it, across and then up, for two of them to cross there.
 */
function placedAt(call: CallAST, fn: TypedHostFn, at: Vec, given: ReadonlyMap<number, string>, env: Env): CallAST {
	const [x, y] = at
	let placed = false
	let lines = 0
	const args = call.args.map((arg, j) => {
		const type = fn.paramTypes[j]
		if (type === undefined) return arg
		if (drawOf(type) === 'line') {
			const across = lines++ % 2 === 0
			return given.has(j) ? arg : parse(`(line.${across ? 'horizontal' : 'vertical'} [${x} ${y}])`)
		}
		if (given.has(j) || placed || !isPlace(unwrapLazy(type))) return arg
		placed = true
		return toAst(at, env)
	})
	return new CallAST(call.head, args, call.kwargs)
}

const valueAt = (root: AST, env: Env, path: string): unknown => {
	const worked = workedOut(root, env, path)
	if (worked !== null) return worked.value
	const slot = reach(root, env, path)?.chain.at(-1)
	return slot === undefined ? undefined : evaluate(slot.ast, slot.env).value
}

/**
 * The place at `path`, if it is worked out from a row rather than written, as the other corners of a
 * rect are: where it is, and how it is worked out, as code. Null if `path` is not one.
 */
function workedOut(root: AST, env: Env, path: string): { value: Vec; place: Place; inside: string } | null {
	const at = workedOutAt(path)
	const grip = at && gripAt(root, env, at.row)
	const handle = grip?.handles.find(({ name, code, at: where }) => name === at!.name && code !== undefined && where !== undefined)
	if (!at || !grip || !handle) return null
	const inside = grip.within === undefined ? at.row : `${at.row}/${grip.within}`
	return { value: handle.at!, place: placeOf(handle.code!, inside), inside }
}

/** `root`, with what is at `source` referring to what is at `of`: a row, or a place worked out from one, as it is worked out. */
function referredTo(root: AST, env: Env, source: string, of: string): AST | null {
	const worked = workedOut(root, env, of)
	return worked === null ? referenceAt(root, env, source, of) : writtenAt(root, env, source, worked.place.ast, worked.place.parts)
}

/**
 * `root`, with the place at `into`, worked out from its row, coming to what `call` makes of what is
 * at each path of `given`: by what its row says that only it goes by, and none of those, each way it
 * is not that already. Null if what its row says cannot come to that, as a rect cannot be turned.
 */
function withCallOnto(root: LetAST, env: Env, into: string, call: AST, given: ReadonlyMap<number, string>): LetAST | null {
	const target = workedOut(root, env, into)
	if (target === null || !(call instanceof CallAST)) return null
	const parts = new Map<string, string>()
	const args = call.args.map((arg, i) => {
		const of = given.get(i)
		if (of === undefined) return arg
		const worked = workedOut(root, env, of)
		if (worked !== null) {
			for (const [name, path] of worked.place.parts) parts.set(name, path)
			return worked.place.ast
		}
		const name = `__given${i}`
		parts.set(name, of)
		return new SymAST(name)
	})
	const whole = new CallAST(call.head, args, call.kwargs)
	const code: Place = { ast: new VecAST([new CallAST(new SymAST('first'), [whole]), new CallAST(new SymAST('last'), [whole])]), parts }
	const at = whereIs(root, env, code)
	if (at === null) return null
	// What what it comes to goes by is not to be changed for it, which would go round in a circle.
	const relative = (path: string): string | null => (path.startsWith(`${target.inside}/`) ? path.slice(target.inside.length + 1) : null)
	const goneBy = new Set([...parts.values()].flatMap(path => relative(path) ?? []))
	const isWritten = (path: string): boolean => {
		const node = reach(root, env, `${target.inside}/${path}`)?.chain.at(-1)?.ast
		const bare = node?.kind === 'meta' ? node.expr : node
		return bare?.kind === 'lit'
	}
	const pick = (paths: readonly string[]): string | undefined =>
		paths.find(path => isWritten(path) && ![...goneBy].some(by => by === path || by.startsWith(`${path}/`) || path.startsWith(`${by}/`)))
	const next = attached(root, env, target.inside, target.place, { at, target: null, label: '', code }, pick)
	return next instanceof LetAST ? next : null
}
const isVec = (value: unknown): value is Vec => Array.isArray(value) && value.length === 2 && value.every(n => typeof n === 'number')
const written = (n: number): string => String(Math.round(n * 100) / 100)

/**
 * `call`, going into `into`, with what it is not given said so that it comes to where `into`
 * already is: what is across a line from one point to another is so across the line halfway
 * between them, square to the way from one to the other. Then neither moves, and either can.
 */
function keepingWhereItIs(name: string, call: AST, root: AST, env: Env, given: ReadonlyMap<number, string>, into: string): AST {
	if (name !== 'vec2.reflect' || !(call instanceof CallAST) || !given.has(0) || given.has(1)) return call
	const [from, to] = [valueAt(root, env, given.get(0)!), valueAt(root, env, into)]
	if (!isVec(from) || !isVec(to) || (from[0] === to[0] && from[1] === to[1])) return call
	const [mx, my] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]
	// Square to the way across, as long as that is, half of it each way from halfway.
	const [px, py] = [-(to[1] - from[1]) / 2, (to[0] - from[0]) / 2]
	const line = parse(`(line.fromPoints [${written(mx - px)} ${written(my - py)}] [${written(mx + px)} ${written(my + py)}])`)
	return new CallAST(call.head, call.args.map((arg, i) => (i === 1 ? line : arg)), call.kwargs)
}

/** A call of a function the program has, starting where it says it is, or else as it would. */
function callOfClosure(name: string, closure: GlispClosure, env: Env, at: Vec): CallAST {
	const given = closure.ast.params.filter(({ optional, variadic }) => !optional && !variadic)
	return new CallAST(
		new SymAST(name),
		given.map(({ type }) => {
			const resolved = resolveTypeSlot(type, closure.capturedEnv)
			return isPlace(resolved) ? toAst(at, env) : defaultFor(resolved, env)
		})
	)
}

/** What is drawn as a row of its own, there to see by and to refer to, rather than as a shape. */
const GUIDE_DRAWS: ReadonlySet<string> = new Set(['point', 'line', 'ray', 'frame'])

/**
 * How what `filter` gives is drawn, by what its type says: `path` for a shape, or one of
 * `GUIDE_DRAWS`, or null if it is nothing to add to a canvas as it is. What does not say is
 * known by what it comes to, which is only as good as what it starts as.
 */
function drawnBy(filter: Filter, root: LetAST, env: Env): string | null {
	const type = filter.fn.returnType
	const draw = drawOf(type)
	if (draw !== null) return draw === 'path' || GUIDE_DRAWS.has(draw) ? draw : null
	if (type?.typeName !== '_') return null
	const { value } = evaluate(callOf(filter, [], env), pushLetFrame(root, env))
	return isPath(value) || isStyled(value) ? 'path' : null
}

/**
 * All that can be called from `root` in `env` that gives something drawn, by group, in the
 * order each is said: for on a canvas, that is what there is to add.
 */
export function addablesIn(root: LetAST, env: Env): readonly Addable[] {
	const own = functionsOfProgram(root, env)
	const seen = new Set(own.map(({ name }) => name))
	const mine = own.flatMap((filter): Addable[] => {
		const draw = drawnBy(filter, root, env)
		if (draw === null) return []
		return [{ name: filter.name, label: filter.label, group: 'Project', ...(draw === 'path' ? {} : { alone: true }) }]
	})
	// Whatever the program can see that gives something drawn, by what it says it gives.
	const found = functionsIn(env)
		.filter(filter => !seen.has(filter.name))
		.flatMap(filter => {
			const draw = drawnBy(filter, root, env)
			return draw === null ? [] : [{ filter, draw }]
		})
	const given = found
		.filter(({ draw }) => draw === 'path')
		.map(({ filter }): Addable => {
			const group = groupOf(filter)
			return { name: filter.name, label: filter.label, group, ...(group === 'Shapes' ? {} : { quiet: true }) }
		})
	// What is said of how some are put down comes first, in that order, then the rest as found.
	const ofGuides = new Map(found.filter(({ draw }) => draw !== 'path').map(({ filter }) => [filter.name, filter.label]))
	const guides = [
		...Object.keys(GUIDES).filter(name => !seen.has(name) && (ofGuides.has(name) || !functionsIn(env).some(f => f.name === name))),
		...[...ofGuides.keys()].filter(name => !(name in GUIDES)),
	].map((name): Addable => ({ name, label: GUIDES[name]?.label ?? ofGuides.get(name)!, group: 'Guides', alone: true }))
	const ofCanvas = OF_CANVAS.filter(({ name }) => !seen.has(name))
	return [...mine, ...given, ...guides, ...ofCanvas]
		.map((item, i) => [item, i] as const)
		.sort(([a, i], [b, j]) => rankOfGroup(a.group) - rankOfGroup(b.group) || i - j)
		.map(([item]) => item)
}

/** How well `query` goes with something, lower being better, or null if it does not. */
function fit({ label, name }: Pick<Addable, 'label' | 'name'>, query: string): number | null {
	const said = label.toLowerCase()
	const written = name.toLowerCase()
	if (said.startsWith(query)) return 0
	if (written.slice(written.lastIndexOf('.') + 1).startsWith(query)) return 1
	if (said.split(/\s+/).some(word => word.startsWith(query))) return 2
	if (said.includes(query) || written.includes(query)) return 3
	// In order, with others between, as `rr` is a round rectangle.
	let at = 0
	for (const letter of written) if (letter === query[at]) at++
	return at === query.length ? 4 : null
}

/**
 * Of `items`, those that go with `query`, the best first, with what is drawn before what
 * is not, of those alike. With nothing asked, what is not quiet, as it is.
 */
export function matching<T extends Pick<Addable, 'label' | 'name' | 'quiet'>>(
	items: readonly T[],
	query: string
): readonly T[] {
	const asked = query.trim().toLowerCase()
	if (asked === '') return items.filter(({ quiet }) => !quiet)
	return items
		.flatMap((item, i) => {
			const rank = fit(item, asked)
			return rank === null ? [] : [{ item, rank, i }]
		})
		.sort((a, b) => a.rank - b.rank || Number(a.item.quiet ?? false) - Number(b.item.quiet ?? false) || a.i - b.i)
		.map(({ item }) => item)
}

/** What a row is called, which is what comes last in what it is, as far as that can be a name. */
const stemOf = (name: string): string =>
	name.slice(name.lastIndexOf('.') + 1).replace(/[^a-zA-Z0-9]/g, '') || 'value'

/**
 * `root` with `name` added in front of all that is there, around `at` if it is a shape. A guide
 * that goes through places goes through the points at `selected`, which it refers to, as far as
 * there are any.
 */
export function withAdded(
	root: LetAST,
	env: Env,
	name: string,
	[x, y]: Vec,
	selected: readonly string[] = []
): { ast: LetAST; row: string; into?: true } | null {
	const closure = closuresIn(root, env).find(([other]) => other === name)?.[1]
	if (closure === undefined) {
		if (name === 'solid') return withSolidAdded(root, SOLID_COLOR)
		if (name === 'graphPaper') return withGraphPaperAdded(root, env)
		if (name === 'axes') return withAxesAdded(root, env)
	}
	const filter = closure === undefined ? functionsIn(env).find(other => other.name === name) : undefined
	const guide = closure === undefined ? GUIDES[name] : undefined
	if (closure === undefined && filter === undefined && guide === undefined) return null
	// What is selected goes in what it fits, as it is referred to there.
	const { given, into } =
		filter !== undefined
			? selectionFor(root, env, filter.fn, selected)
			: { given: new Map(pointsSelected(root, env, selected).slice(0, guide?.places ?? 0).entries()), into: null }
	const shape = SHAPES[name] ?? STARTS_AROUND[name]
	// A guide that nothing says how to put down goes through where it was asked for, by its first place.
	const placed = (call: CallAST): CallAST =>
		filter !== undefined && GUIDE_DRAWS.has(drawOf(filter.fn.returnType) ?? '') ? placedAt(call, filter.fn, [x, y], given, env) : call
	const call: AST =
		closure !== undefined
			? callOfClosure(name, closure, env, [x, y])
			: guide !== undefined
				? parse(guide.code(x, y, given.size))
				: shape
					? parse(`(${name} ${shape(x, y)})`)
					: placed(callOf(filter!, [], env))
	if (into !== null) {
		const kept = keepingWhereItIs(name, call, root, env, given, into)
		const next = workedOutAt(into) !== null ? withCallOnto(root, env, into, kept, given) : withCallInto(root, env, into, kept, given)
		return next === null ? null : { ast: next, row: into, into: true }
	}
	const called = freeName(root, guide?.stem ?? stemOf(name))
	return { ast: withReferences(withLayerAdded(root, called, call) as LetAST, env, `binding:${called}`, given), row: `binding:${called}` }
}

/** Something that can go in a place that wants a value: a function, or what is already there to refer to. */
export interface Filler extends Addable {
	readonly value?: boolean
}

/** Whether something is of the same kind as what is there, where nothing says what is wanted. */
const isLike = (current: unknown, value: unknown): boolean =>
	Array.isArray(current)
		? Array.isArray(value) && value.length === current.length
		: typeof value === typeof current && value !== undefined && value !== null

/** Whether what is of this type goes in a place, by what that wants or else what it has. */
function goesIn(wanted: TypeValue | null, current: unknown, type: TypeValue): boolean {
	if (wanted === null) return isLike(current, unwrapLazy(type).default)
	if (wanted.typeName === '_') return true
	// What says nothing of what it gives could be anything, which is no reason to list it.
	return type.typeName !== '_' && typeFits(type, wanted)
}

/** How many errors there are in the program, for what would make more to be left out. */
const errorsIn = (ast: AST, env: Env): number =>
	check(ast, env).filter(({ level }) => level === 'error').length

const inPlace = (root: AST, env: Env, path: string, next: AST): AST | null => {
	const chain = reach(root, env, path)?.chain
	const slot = chain?.at(-1)
	if (!chain || !slot) return null
	const { ast } = slot
	return withParent(chain, slot.replace(ast.kind === 'meta' ? new MetaAST(ast.metadata, next) : next))
}

/**
 * What can go at `path`, which is two things that are not told apart by what is asked for:
 * what is there to refer to, in place of what is there, then what takes what is there and
 * gives what will do, then what gives that of itself.
 */
export function fillersAt(root: LetAST, env: Env, path: string): readonly Filler[] {
	const slot = reach(root, env, path)?.chain.at(-1)
	if (slot === undefined) return []
	const { expected, ast } = slot
	const current = evaluate(ast, slot.env).value
	const before = errorsIn(root, env)
	const seen = new Set<string>()
	const values: Filler[] = []
	const where = path.startsWith('binding:') ? pushLetFrame(root, env) : env
	for (let frame: Env = where; frame !== null; frame = frame.parent) {
		// What a host gave that is not a function is a type or a constant, of which only some will do.
		for (const [name, { ast: bound, env: at }] of frame.bindings ?? []) {
			if (seen.has(name) || (path === `binding:${name}`)) continue
			seen.add(name)
			const { value } = evaluate(bound, at)
			if (value === undefined || value === null || isGlispClosure(value) || isTypedHostFn(value) || isTypeValue(value)) continue
			if (expected === null ? !isLike(current, value) : !expected.fits(value)) continue
			const next = inPlace(root, env, path, new SymAST(name))
			if (next === null || errorsIn(next, env) > before) continue
			// Coming back to itself is only found in working it out.
			if (next.kind === 'let') {
				const { diagnostics } = evaluate(new SymAST(name), pushLetFrame(next as LetAST, env))
				if (diagnostics.some(({ level }) => level === 'error')) continue
			}
			values.push({ name, label: name, group: 'Values', value: true })
		}
	}
	const own = functionsOfProgram(root, env)
	const taken = new Set(own.map(({ name }) => name))
	const wrapping = new Set(filtersFor([current], env, own).map(({ name }) => name))
	const functions = [...own, ...functionsIn(env).filter(({ name }) => !taken.has(name))]
		.filter(({ fn }) => fn.returnType !== undefined && goesIn(expected, current, fn.returnType))
		.map(
			(filter): Filler => ({
				name: filter.name,
				label: filter.label,
				group: wrapping.has(filter.name) ? 'Wrap' : taken.has(filter.name) ? 'Project' : groupOf(filter),
			})
		)
		.map((item, i) => [item, i] as const)
		.sort(([a, i], [b, j]) => rankOfGroup(a.group) - rankOfGroup(b.group) || i - j)
		.map(([item]) => item)
	return [...values, ...functions]
}

/**
 * `root` with `filler` at `path`. A function that takes what was there takes it, and it goes
 * on being there. Otherwise, it starts as it would, around `at` if it is a shape.
 */
export function withFilled(root: LetAST, env: Env, path: string, filler: Filler, [x, y]: Vec): AST | null {
	if (filler.value) return inPlace(root, env, path, new SymAST(filler.name))
	const own = functionsOfProgram(root, env).find(({ name }) => name === filler.name)
	const filter = own ?? functionsIn(env).find(({ name }) => name === filler.name)
	if (filter === undefined) return null
	const slot = reach(root, env, path)?.chain.at(-1)
	if (slot === undefined) return null
	const current = evaluate(slot.ast, slot.env).value
	if (filtersFor([current], env, [filter]).some(({ name }) => name === filter.name)) {
		return wrappedAt(root, env, path, filter)
	}
	const shape = SHAPES[filter.name]
	const call: AST = shape ? parse(`(${filter.name} ${shape(x, y)})`) : callOf(filter, [], env)
	return inPlace(root, env, path, call)
}
