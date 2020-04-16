import Env from '../env'
import core from './core'
import path from './path'
import {MalNamespace, symbolFor as S} from '../types'

const namespaces: (MalNamespace | string)[] = [core, path]

export function declareAllNamespaces(env: Env) {
	namespaces.forEach(ns => {
		// const code = typeof ns === 'string' ? ns : ns.malCode
		const objects = typeof ns === 'object' && ns.jsObjects

		if (objects) {
			objects.forEach((v, k) => env.set(S(k), v))
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
