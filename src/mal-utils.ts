import {
	MalVal,
	M_FN,
	M_META,
	isMap,
	MalFunc,
	isMalNode,
	keywordFor as K,
	MalMap,
	MalNode,
	isVector
} from '@/mal/types'
import ConsoleScope from './scopes/console'

function getPrimitiveType(exp: MalVal): string | null {
	if (isVector(exp)) {
		const isAllNumber = exp.every(v => typeof v === 'number')
		if (isAllNumber) {
			switch (exp.length) {
				case 2:
					return 'vec2'
				case 6:
					return 'mat2d'
			}
		}
	}
	return null
}

export function fnMeta(
	exp: MalNode
): {meta: MalVal; aliasFor: string | null; primitive: string | null} | null {
	if (isMalNode(exp) && Array.isArray(exp)) {
		let fn = exp[M_FN]
		let primitive = null

		// Check if primitive type
		if (!fn) {
			primitive = getPrimitiveType(exp)
			if (primitive) {
				fn = ConsoleScope.var(`${primitive}/init`) as MalFunc
			}
		}

		if (fn && M_META in (fn as MalFunc)) {
			const meta = (fn as MalFunc)[M_META] as MalVal

			if (isMap(meta)) {
				if (meta[K('alias')]) {
					const alias = meta[K('alias')] as MalMap
					return {
						meta: alias[K('meta')],
						aliasFor: alias[K('name')] as string,
						primitive
					}
				} else {
					return {meta, aliasFor: null, primitive}
				}
			}
		}
	}

	return null
}
