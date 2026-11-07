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
	LetAST,
	MetaAST,
	parse,
	pushLetFrame,
	resolveTypeSlot,
	SymAST,
	toAst,
	typeFits,
	type TypeValue,
	unwrapLazy,
} from '@glisp/lang'
import { callOf, type Filter, filtersFor, functionsIn, functionsOfProgram, wrappedAt } from '@glisp/tweeq/filters'
import { reach, withParent } from '@glisp/tweeq/rowsClipboard'
import { defaultFor, referenceAt, withLayerAdded } from '@glisp/tweeq/structure'

import { isPath, isStyled, type Vec } from './graphics'
import { freeName, withAxesAdded, withGraphPaperAdded, withSolidAdded } from './rows'
import { paintedIn } from './scene'

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
	point: { label: 'Point', stem: 'point', code: (x, y) => `(: [${x} ${y}] point)` },
	'vec2.lerp': {
		label: 'Lerp',
		stem: 'lerp',
		places: 2,
		// From a point, it goes on toward where it is asked for.
		code: (x, y, given) =>
			given === 0 ? `(vec2.lerp [${x - 50} ${y}] [${x + 50} ${y}] 0.5)` : `(vec2.lerp [${x} ${y}] [${x} ${y}] 0.5)`,
	},
	'vec2.nudge': {
		label: 'Nudge',
		stem: 'nudge',
		places: 1,
		code: (x, y) => `(vec2.nudge [${x} ${y}] [50 0])`,
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
	'ray.fromPoints': {
		label: 'Ray Through Points',
		stem: 'ray',
		places: 2,
		// From a point, it goes on through where it is asked for.
		code: (x, y, given) =>
			given === 0 ? `(ray.fromPoints [${x} ${y}] [${x + 100} ${y}])` : `(ray.fromPoints [${x} ${y}] [${x} ${y}])`,
	},
	'ray.at': { label: 'Ray at an Angle', stem: 'ray', places: 1, code: (x, y) => `(ray.at [${x} ${y}] 0)` },
	'rect.new': {
		label: 'Rect',
		stem: 'rect',
		places: 1,
		code: (x, y) => `(rect.new [${x - 50} ${y - 50}] [100 100])`,
	},
}

/** `root` with the row called `name` saying `code`, referring to the points at `rows` first. */
function withGuide(root: LetAST, env: Env, name: string, code: string, rows: readonly string[]): LetAST {
	const row = `binding:${name}`
	const added = withLayerAdded(root, name, parse(code)) as LetAST
	return rows.reduce<LetAST>((ast, of, i) => {
		const next = referenceAt(ast, env, `${row}/arg${i}`, of)
		return next instanceof LetAST ? next : ast
	}, added)
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

/**
 * Whether what `filter` gives is something drawn. What does not say is known by what it
 * comes to, which is only as good as what it starts as.
 */
function draws(filter: Filter, root: LetAST, env: Env): boolean {
	const type = filter.fn.returnType
	if (type?.typeName === 'path' || type?.typeName === 'styled') return true
	if (type?.typeName !== '_') return false
	const { value } = evaluate(callOf(filter, [], env), pushLetFrame(root, env))
	return isPath(value) || isStyled(value)
}

/**
 * All that can be called from `root` in `env` that gives something drawn, by group, in the
 * order each is said: for on a canvas, that is what there is to add.
 */
export function addablesIn(root: LetAST, env: Env): readonly Addable[] {
	const own = functionsOfProgram(root, env)
	const seen = new Set(own.map(({ name }) => name))
	const mine = own
		.filter(filter => draws(filter, root, env))
		.map((filter): Addable => ({ name: filter.name, label: filter.label, group: 'Project' }))
	const given = functionsIn(env)
		.filter(filter => !seen.has(filter.name) && draws(filter, root, env))
		.map((filter): Addable => {
			const group = groupOf(filter)
			return { name: filter.name, label: filter.label, group, ...(group === 'Shapes' ? {} : { quiet: true }) }
		})
	const guides = Object.entries(GUIDES)
		.filter(([name]) => !seen.has(name))
		.map(([name, { label }]): Addable => ({ name, label, group: 'Guides', alone: true }))
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
): { ast: LetAST; row: string } | null {
	const closure = closuresIn(root, env).find(([other]) => other === name)?.[1]
	if (closure === undefined) {
		const guide = GUIDES[name]
		if (guide !== undefined) {
			const called = freeName(root, guide.stem)
			const points = new Set(paintedIn(root, env).filter(({ draw }) => draw === 'point').map(({ row }) => row))
			const rows = selected.filter(row => points.has(row)).slice(0, guide.places ?? 0)
			return { ast: withGuide(root, env, called, guide.code(x, y, rows.length), rows), row: `binding:${called}` }
		}
		if (name === 'solid') return withSolidAdded(root, SOLID_COLOR)
		if (name === 'graphPaper') return withGraphPaperAdded(root, env)
		if (name === 'axes') return withAxesAdded(root, env)
	}
	const filter = closure === undefined ? functionsIn(env).find(other => other.name === name) : undefined
	if (closure === undefined && filter === undefined) return null
	const shape = SHAPES[name] ?? STARTS_AROUND[name]
	const call: AST =
		closure !== undefined
			? callOfClosure(name, closure, env, [x, y])
			: shape
				? parse(`(${name} ${shape(x, y)})`)
				: callOf(filter!, [], env)
	const called = freeName(root, stemOf(name))
	return { ast: withLayerAdded(root, called, call), row: `binding:${called}` }
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
