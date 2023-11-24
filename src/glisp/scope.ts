import color from '@/glisp-lib/color'
import core from '@/glisp-lib/core'
import math from '@/glisp-lib/math'
import path from '@/glisp-lib/path'

import Env from './env'
import {evaluate} from './eval'
import {BlankException, parse} from './parse'
import {printer, printExpr} from './print'
import ReplCore from './repl-core'
import {Expr, GlispError, symbolFor as S} from './types'

const libraries = new Map<string, Expr>([
	['core.js', core],
	['math.js', math],
	['path.js', path],
	['color.js', color],
])

const normalizeURL = (url: string, basename: string) => {
	return new URL(url, basename).href
}

export class Scope<T> {
	public env!: Env

	private inner!: Scope<any>

	constructor(
		private outer: Scope<any> | null = null,
		private name = 'repl',
		private onSetup: ((scope: Scope<T>, option: T) => any) | null = null
	) {
		this.setup()

		if (this.outer === null) {
			this.#initAsRepl()
		} else {
			this.outer.inner = this
		}
	}

	#initAsRepl() {
		// Defining essential functions

		ReplCore.forEach(([name, expr]) => {
			this.def(name, expr)
		})

		this.def('normalize-url', (url: Expr) => {
			const basename = this.var('*filename*') as string
			return normalizeURL(url as string, basename)
		})

		this.def('eval', (exp: Expr) => {
			return evaluate(exp, this.env)
		})

		this.def('import-js-force', (url: Expr) => {
			// const basename = this.var('*filename*') as string
			// const absurl = normalizeURL(url as string, basename)
			// const text = slurp(absurl)
			// eval(text)
			// const exp = (globalThis as any)['glisp_library']
			// return evaluate(exp, this.env)

			const library = libraries.get(url as string)

			if (!library) {
				throw new Error(`Library ${url} not found`)
			}

			const evaluated = evaluate(library, this.env)

			return evaluated
		})

		const filename = new URL('.', document.baseURI).href

		this.def('*filename*', filename)

		this.readEval(
			`(def import-force
				(=> [path]
					(let [url (normalize-url path)]
						(eval (read-string
									(format "(do (def *filename* \\"%s\\") %s \n null)"
													url
													(slurp url)))))))`
		)

		// Load core library as default
		this.readEval('(import-force "./lib/core.glisp")')
	}

	setup(option?: T) {
		this.env = new Env(this.outer?.env)
		this.env.name = this.name

		if (this.onSetup && option) {
			this.onSetup(this, option)
		}

		if (this.inner) {
			this.inner.env.setOuter(this.env)
		}
	}

	REP(str: string): void {
		const ret = this.readEval(str)
		if (ret !== undefined) {
			printer.return(printExpr(ret))
		}
	}

	readEval(str: string): Expr | undefined {
		try {
			return this.eval(parse(str))
		} catch (err) {
			if (err instanceof BlankException) {
				return null
			}

			if (err instanceof GlispError) {
				printer.error(err)
			} else if (err instanceof Error) {
				printer.error(err.stack)
			}
		}
	}

	eval(exp: Expr): Expr | undefined {
		try {
			return evaluate(exp, this.env)
		} catch (err) {
			if (err instanceof GlispError) {
				printer.error(err)
			} else if (err instanceof Error) {
				printer.error(err.stack)
			}
		}
		return null
	}

	def(name: string, value: Expr) {
		this.env.set(S(name), value)
	}

	pushBinding(env: Env) {
		this.env.pushBinding(env)
	}

	popBinding() {
		this.env.popBinding()
	}

	var(name: string) {
		return this.env.get(S(name))
	}
}
