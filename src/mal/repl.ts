import {MalVal, symbolFor as S} from './types'

import readStr from './reader'
import printExp from './printer'
import evalExp from './eval'
import {slurp} from './ns/core'

import Env from './env'
import {declareAllNamespaces} from './ns'

// Initialize root Env
export const replEnv: Env = new Env()
replEnv.name = 'repl'

// Namespace decleration
declareAllNamespaces(replEnv)

// Root REPL
export const REP = (str: string, env: Env = replEnv) =>
	printExp(evalExp(readStr(str), env))

// Defining essential functions
replEnv.set(S('eval'), (exp: MalVal) => {
	return evalExp(exp, replEnv)
})

replEnv.set(S('import-js-force'), (url: MalVal) => {
	const filename = REP('__filename__').slice(1, -1)
	const absurl = new URL(url as string, filename).href
	console.log(absurl)
	const text = slurp(absurl)
	eval(text)
	const exp = (self as any)['glisp_library']
	return evalExp(exp, replEnv)
})

/* eslint-disable no-useless-escape */
REP(`(def __filename__ (js-eval "new URL('.', document.baseURI).href"))`)
REP(`(def import-force
  (fn [path]
		(let [url (js-eval (format "new URL('%s', '%s')" path __filename__))]
      (eval (read-string
             (format "(do (def __filename__ \\"%s\\") %s \n nil)"
										 url
                     (slurp url)))))))`)

// Load core library as default
REP('(import-force "./lib/core.cljs")')
