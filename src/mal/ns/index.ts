import Env from '../env'
import core from './core'
import {MalNamespace, symbolFor as S, M_META} from '../types'
import {convertJSObjectToMalMap} from '../reader'

const namespaces: (MalNamespace | string)[] = [core]

export function declareAllNamespaces(env: Env) {
	namespaces.forEach(ns => {
		// const code = typeof ns === 'string' ? ns : ns.malCode
		const objects = typeof ns === 'object' && ns.jsObjects

		if (objects) {
			objects.forEach(([k, v, meta]) => {
				if (meta) {
					v[M_META] = convertJSObjectToMalMap(meta)
				}
				env.set(S(k), v)
			})
		}

		// if (code) {
		// 	try {
		// 		EVAL(READ(`(do ${code} \n nil)`), env)
		// 	} catch (e) {
		// 		if (!(e instanceof BlankException)) {
		// 			console.error(e)
		// 		}
		// 	}
		// }
	})
}
