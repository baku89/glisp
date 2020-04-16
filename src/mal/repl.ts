import {MalVal, symbolFor as S} from './types'

import readStr from './reader'
import printExp, {printer} from './printer'
import evalExp from './eval'

import Env from './env'
import {declareAllNamespaces} from './ns'

// Initialize root Env
export const replEnv: Env = new Env()
replEnv.name = 'repl'

// eval(0) should be declared before everything
replEnv.set(S('eval'), (ast: MalVal) => {
	return evalExp(ast, replEnv)
})

// Namespace decleration
declareAllNamespaces(replEnv)

// Root REPL
export const REP = (str: string, env: Env = replEnv) => {
	try {
		printExp(evalExp(readStr(str), env))
	} catch (err) {
		printer.error(err)
	}
}

// Load core library

/* eslint-disable no-useless-escape */
REP(`(def __filename__ (js-eval "new URL('.', document.baseURI).href"))`)
REP(`(def load-file-force
  (fn (path)
		(let (url (js-eval (format "new URL('%s', '%s')" path __filename__)))
      (eval (read-string
             (format "(do (def __filename__ \\"%s\\") %s \n nil)"
                     url
                     (slurp url)))))))`)

REP('(load-file-force "./lib/core.cljs")')
