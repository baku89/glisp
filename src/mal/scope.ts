import Env from './env'
import evalExp from './eval'
import printExp, {printer} from './printer'
import readStr, {BlankException} from './reader'
import ReplCore, {slurp} from './repl-core'
import {MalError, MalVal, symbolFor as S} from './types'

const normalizeURL = (url: string, basename: string) => {
	return new URL(url, basename).href
}

export default class Scope<T> {
	public env!: Env

	private inner!: Scope<any>

	constructor(
		private outer: Scope<any> | null = null,
		private name = 'repl',
		private onSetup: ((scope: Scope<T>, option: T) => any) | null = null,
		private cache = false
	) {
		this.setup()

		if (this.outer === null) {
			this.initAsRepl()
		} else {
			this.outer.inner = this
		}
	}

	private initAsRepl() {
		// Defining essential functions

		ReplCore.forEach(([name, expr]) => {
			this.def(name, expr)
		})

		this.def('normalize-url', (url: MalVal) => {
			const basename = this.var('*filename*') as string
			return normalizeURL(url as string, basename)
		})

		this.def('eval', (exp: MalVal) => {
			return evalExp(exp, this.env)
		})

		this.def('import-js-force', (url: MalVal) => {
			const basename = this.var('*filename*') as string
			const absurl = normalizeURL(url as string, basename)
			console.log('importing', absurl)
			const text = slurp(absurl)
			eval(text)
			const exp = (globalThis as any)['glisp_library']
			return evalExp(exp, this.env)
		})

		const filename = new URL('.', document.baseURI).href

		this.def('*filename*', filename)

		this.readEval(
			`(def import-force
				(fn [path]
					(let [url (normalize-url path)]
						(eval (read-string
									(format "(do (def *filename* \\"%s\\") %s \n nil)"
													url
													(slurp url)))))))`
		)
		// Load core library as default
		this.readEval('(import-force "./lib/core.glisp")')
	}

	public setup(option?: T) {
		this.env = new Env(this.outer?.env)
		this.env.name = this.name

		if (this.onSetup && option) {
			this.onSetup(this, option)
		}

		if (this.inner) {
			this.inner.env.setOuter(this.env)
		}
	}

	public REP(str: string): void {
		const ret = this.readEval(str)
		if (ret !== undefined) {
			printer.return(printExp(ret))
		}
	}

	public readEval(str: string): MalVal | undefined {
		try {
			return this.eval(readStr(str))
		} catch (err) {
			if (err instanceof BlankException) {
				return null
			}

			if (err instanceof MalError) {
				printer.error(err)
			} else if (err instanceof Error) {
				printer.error(err.stack)
			}
		}
	}

	public eval(exp: MalVal): MalVal | undefined {
		try {
			return evalExp(exp, this.env, this.cache)
		} catch (err) {
			if (err instanceof MalError) {
				printer.error(err)
			} else if (err instanceof Error) {
				printer.error(err.stack)
			}
		}
	}

	public def(name: string, value: MalVal) {
		this.env.set(S(name), value)
	}

	public pushBinding(env: Env) {
		this.env.pushBinding(env)
	}

	public popBinding() {
		this.env.popBinding()
	}

	public var(name: string) {
		return this.env.get(S(name))
	}
}
