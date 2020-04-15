import Env from '../env'
// import {EVAL, READ, PRINT} from '../repl'

import core from './core'
import path from './path'
// import readStr, {BlankException} from '../reader'
import {MalNamespace} from '../types'

const namespaces: (MalNamespace | string)[] = [
	core,
	path
]

export function declareAllNamespaces(env: Env) {
	namespaces.forEach(ns => {
		// const code = typeof ns === 'string' ? ns : ns.malCode
		const objects = typeof ns === 'object' && ns.jsObjects

		if (objects) {
			objects.forEach((v, k) => env.set(k, v))
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
