import Env from './env'
import readStr, {BlankException} from './reader'
import evalExp from './eval'
import ReplCore, {slurp} from './repl-core'
import {symbolFor as S, MalVal, LispError} from './types'
import {printer} from './printer'

export default class Scope<T> {
	public env!: Env

	constructor(
		private outer: Scope<any> | null = null,
		private name = 'repl',
		private onSetup: ((scope: Scope<T>, option: T) => any) | null = null
	) {
		this.setup()

		if (this.outer === null) {
			this._initAsRoot()
		}
	}

	private _initAsRoot() {
		// Defining essential functions
		ReplCore.forEach(([name, expr]) => {
			this.def(name, expr)
		})

		this.def('eval', (exp: MalVal) => {
			return evalExp(exp, this.env)
		})

		this.def('import-js-force', (url: MalVal) => {
			const filename = this.var('__filename__') as string
			const absurl = new URL(url as string, filename).href
			const text = slurp(absurl)
			eval(text)
			const exp = (self as any)['glisp_library']
			return evalExp(exp, this.env)
		})

		this.readEval(
			`(def __filename__ (js-eval "new URL('.', document.baseURI).href"))`
		)

		this.readEval(
			`(def import-force
				(fn [path]
					(let [url (js-eval (format "new URL('%s', '%s')" path __filename__))]
						(eval (read-string
									(format "(do (def __filename__ \\"%s\\") %s \n nil)"
													url
													(slurp url)))))))`
		)
		// Load core library as default
		this.readEval('(import-force "./lib/core.cljs")')
	}

	public setup(option?: T) {
		this.env = new Env(this.outer?.env)
		this.env.name = this.name

		if (this.onSetup && option) {
			this.onSetup(this, option)
		}
	}

	public readEval(str: string): MalVal | undefined {
		try {
			return this.eval(readStr(str))
		} catch (err) {
			if (err instanceof BlankException) {
				return null
			}
			throw err
		}
	}

	public eval(exp: MalVal): MalVal | undefined {
		try {
			return evalExp(exp, this.env)
		} catch (err) {
			throw err
		}
	}

	public def(name: string, value: MalVal) {
		this.env.set(S(name), value)
	}

	public var(name: string) {
		return this.env.get(S(name))
	}
}
