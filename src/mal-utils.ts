import {
	MalVal,
	M_FN,
	isMap,
	MalFunc,
	keywordFor as K,
	MalMap,
	MalNode,
	isVector,
	MalJSFunc,
	M_EVAL,
	isSeq,
	keywordFor,
	getMeta
} from '@/mal/types'
import ConsoleScope from './scopes/console'

export function getPrimitiveType(exp: MalVal): string | null {
	if (isVector(exp)) {
		const isAllNumber =
			exp instanceof Float32Array || exp.every(v => typeof v === 'number')
		if (isAllNumber) {
			switch (exp.length) {
				case 2:
					return 'vec2'
				case 4:
					return 'rect2d'
				case 6:
					return 'mat2d'
			}
		}
	}
	return null
}

export function getMapValue(exp: MalVal | undefined, path: string): MalVal {
	if (exp === undefined) {
		return null
	}

	const keys = path.split('/').map(k => (/^[0-9]+$/.test(k) ? parseInt(k) : k))

	while (keys.length > 0) {
		const key = keys[0]

		if (typeof key === 'number') {
			if (!isSeq(exp) || exp[key] === undefined) {
				return null
			}
			exp = exp[key]
		} else {
			// map key
			const kw = keywordFor(key)
			if (!isMap(exp) || !(kw in exp)) {
				return null
			}

			exp = exp[kw]
		}

		keys.shift()
	}
	return exp
}

export interface FnInfoType {
	fn: MalFunc | MalJSFunc
	meta: MalMap
	aliasFor: string | null
	primitive: string | null
}

export function getFnInfo(exp: MalNode): FnInfoType | null {
	if (isSeq(exp)) {
		let fn = exp[M_FN]
		let primitive = null

		// Check if primitive type
		if (!fn) {
			primitive = getPrimitiveType(exp[M_EVAL] || exp)
			if (primitive) {
				fn = ConsoleScope.var(primitive) as MalFunc
			}
		}

		const meta = getMeta(fn)

		if (isMap(meta)) {
			const alias = getMapValue(meta, 'alias')
			if (isMap(alias)) {
				// is alias
				const aliasMeta = alias[K('meta')]
				const aliasFor = alias[K('name')]

				if (isMap(aliasMeta) && typeof aliasFor === 'string') {
					return {
						fn,
						meta: aliasMeta,
						aliasFor,
						primitive
					}
				}
			} else {
				// is not alias
				return {fn, meta, aliasFor: null, primitive}
			}
		}
	}

	return null
}
