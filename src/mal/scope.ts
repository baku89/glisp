import Env from './env'
import readStr, {jsToMal, MalBlankException} from './reader'
import evalExp from './eval'
import ReplCore, {slurp} from './repl-core'
import {
	MalVal,
	MalError,
	MalString,
	MalNil,
	MalFn,
	MalCallableValue,
} from './types'
import {printer} from './printer'
import isNodeJS from 'is-node'

const normalizeURL = (() => {
	if (isNodeJS) {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const path = require('path')
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const fs = require('fs')

		return (url: string, pwd: string) => {
			const dir = fs.statSync(pwd).isDirectory(pwd) ? pwd : path.dirname(pwd)
			return path.join(dir, url)
		}
	} else {
		return (url: string, pwd: string) => {
			return new URL(url, pwd).href
		}
	}
})()

export default class Scope {
	public env!: Env

	private inner!: Scope

	constructor(
		private outer: Scope | null = null,
		private name = 'repl',
		private onSetup: ((scope: Scope, option: any) => any) | null = null
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
			this.def(name, jsToMal(expr as any))
		})

		this.defn('normalize-url', (url: MalVal) => {
			const pwd = this.var('*filename*').value as string
			return MalString.create(normalizeURL(url.value as string, pwd))
		})

		this.defn('eval', (exp: MalVal) => {
			return evalExp(exp, this.env)
		})

		this.defn('import-js-force', (url: MalVal) => {
			const pwd = this.var('*filename*') as MalString
			const absurl = normalizeURL(url.value as string, pwd.value)
			const text = slurp(absurl)
			eval(text)
			const exp = (globalThis as any)['glisp_library']

			this.def('*filename*', MalString.create(absurl))
			evalExp(exp, this.env)
			this.def('*filename*', pwd)

			return MalNil.create()
		})

		let filename: string
		if (isNodeJS) {
			filename = __filename
		} else {
			filename = new URL('.', document.baseURI).href
		}
		this.def('*filename*', MalString.create(filename))

		this.defn('import-force', (url: MalVal) => {
			const pwd = this.var('*filename*') as MalString
			const absurl = normalizeURL((url as MalString).value, pwd.value)
			const text = slurp(absurl)

			this.def('*filename*', MalString.create(absurl))
			this.readEval(`(do ${text}\nnil)`)
			this.def('*filename*', pwd)

			return MalNil.create()
		})

		// Load core library as default
		this.readEval('(import-force "./lib/core.glisp")')

		// Set the current filename to pwd
		if (isNodeJS) {
			this.def('*filename*', MalString.create(process.cwd()))
		}
	}

	public setup(option?: any) {
		this.env = new Env({outer: this.outer?.env, name: this.name})

		if (this.onSetup && option) {
			this.onSetup(this, option)
		}

		if (this.inner) {
			this.inner.env.outer = this.env
		}
	}

	public REP(str: string): void {
		const ret = this.readEval(str)
		if (ret !== undefined) {
			printer.return(ret.print())
		}
	}

	public readEval(str: string): MalVal | undefined {
		try {
			return this.eval(readStr(str))
		} catch (err) {
			if (err instanceof MalBlankException) {
				return MalNil.create()
			}

			if (err instanceof MalError) {
				printer.error(err)
			} else {
				printer.error(err.stack)
			}

			return undefined
		}
	}

	public eval(exp: MalVal): MalVal | undefined {
		try {
			return evalExp(exp, this.env)
		} catch (err) {
			if (err instanceof MalError) {
				printer.error(err)
			} else {
				printer.error(err.stack)
			}
			return undefined
		}
	}

	public def(name: string, value: MalVal) {
		this.env.set(name, value)
	}

	public defn(name: string, fn: MalCallableValue) {
		const f = MalFn.create(fn)
		this.env.set(name, f)
	}

	public pushBinding(env: Env) {
		this.env.pushBinding(env)
	}

	public popBinding() {
		this.env.popBinding()
	}

	public var(name: string) {
		return this.env.get(name)
	}
}
