/**
 * The color that a type goes by, which is that of its values as they are written: a number has
 * the color of a number in code, wherever it is a port, a wire or a mark that stands for one.
 */

import { type TypeValue, unwrapLazy } from '@glisp/lang'

import { colorOfToken, type TokenRule } from './repl'

/** The scope of the token that a value of each type that has a way of writing its own is. */
const SCOPE_OF_NAMED: Readonly<Record<string, string>> = {
	number: 'number',
	string: 'string',
	boolean: 'constant.language',
	unit: 'constant.language',
}

const SCOPE_OF_WRITTEN = { number: 'number', string: 'string', boolean: 'constant.language' } as const

/**
 * The scope that a value of `type` is highlighted by, or null where nothing is known of it or
 * its values are written with no token of their own, as a record's are. A vector goes by what
 * it holds, if all of that goes by the same: see `isManyType` for what tells it from one of them.
 */
export function scopeOfType(type: TypeValue | null): string | null {
	if (type === null) return null
	const known = unwrapLazy(type.plain ?? type)
	const { shape } = known
	switch (shape.kind) {
		case 'primitive':
			return SCOPE_OF_NAMED[known.typeName] ?? null
		case 'literal':
			return SCOPE_OF_WRITTEN[typeof shape.value as keyof typeof SCOPE_OF_WRITTEN]
		case 'refine':
			return scopeOfType(shape.base)
		case 'function':
			return 'function'
		case 'union':
			// One that is any of several goes by what they all go by, if they do.
			return shared(shape.members)
		case 'vector':
			return scopeOfType(shape.element)
		case 'tuple':
			return shared(shape.rest === undefined ? shape.elements : [...shape.elements, shape.rest])
		default:
			return null
	}
}

/** The scope that all of `types` go by, if there is one. */
function shared(types: readonly TypeValue[]): string | null {
	const scopes = new Set(types.map(scopeOfType))
	const [only] = scopes
	return scopes.size === 1 && only !== undefined ? only : null
}

/** Whether a value of `type` is a vector, which holds many: what is drawn for it is drawn double. */
export function isManyType(type: TypeValue | null): boolean {
	if (type === null) return false
	const { kind } = unwrapLazy(type.plain ?? type).shape
	return kind === 'vector' || kind === 'tuple'
}

/** The color of `type` by the `rules` of a theme, if it has one. */
export function colorOfType(type: TypeValue | null, rules: readonly TokenRule[]): string | undefined {
	const scope = scopeOfType(type)
	return scope === null ? undefined : colorOfToken(scope, rules)
}
