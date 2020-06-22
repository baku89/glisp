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
	getMeta,
	MalNodeSeq,
	isMalFunc,
	getType,
	markMalVector as V,
	isSymbol,
	MalSymbol,
	symbolFor as S,
	M_EVAL_PARAMS
} from '@/mal/types'
import ConsoleScope from './scopes/console'
import {replaceExp} from './mal/eval'

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

export function reverseEval(
	exp: MalVal,
	original: MalVal,
	forceOverwrite = true
) {
	// const meta = getMeta(original)

	switch (getType(original)) {
		case 'list': {
			// Check if the list is wrapped within const
			if ((original as MalNodeSeq)[0] === S('const')) {
				return original
			} else {
				// find Inverse function
				const info = getFnInfo(original as MalNodeSeq)
				if (info) {
					const inverseFn = getMapValue(info.meta, 'inverse')

					if (isMalFunc(inverseFn)) {
						const fnName = (original as MalNodeSeq)[0]
						const fnOriginalParams = (original as MalNodeSeq).slice(1)
						const fnEvaluatedParams = (original as MalNodeSeq)[M_EVAL_PARAMS]
						const fnParams = inverseFn(exp, fnOriginalParams, fnEvaluatedParams)

						if (isSeq(fnParams)) {
							const newExp = [fnName, ...fnParams]

							for (let i = 1; i < (original as MalNodeSeq).length; i++) {
								newExp[i] = reverseEval(
									newExp[i],
									(original as MalNodeSeq)[i],
									forceOverwrite
								)
							}
							return newExp
						}
					}
				}
			}
			break
		}
		case 'vector': {
			if (isVector(exp) && exp.length === (original as MalNodeSeq).length) {
				const newExp = V(
					exp.map((e, i) =>
						reverseEval(e, (original as MalNodeSeq)[i], forceOverwrite)
					)
				)
				return newExp
			}
			break
		}
		case 'symbol': {
			const def = (original as MalSymbol).def
			if (def && !isSymbol(exp)) {
				// NOTE: Making side-effects on the below line
				const newDefBody = reverseEval(exp, def[2], forceOverwrite)
				replaceExp(def, [S('defvar'), original, newDefBody])
				return original
			}
			break
		}
	}

	return forceOverwrite ? exp : original
}
