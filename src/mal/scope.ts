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

	private initAsRepl() {
		const normalizeImportURL = (() => {
			if (isNodeJS) {
				// eslint-disable-next-line @typescript-eslint/no-var-requires
				const path = require('path')

				return (url: string) => {
					if (url.startsWith('.')) {
						// Relative
						const basepath = this.var('*filename*').value as string
						return path.join(path.dirname(basepath), url)
					} else {
						// Library
						const basepath = this.var('*libpath*').value as string
						return path.join(basepath, url)
					}
				}
			} else {
				return (url: string) => {
					if (url.startsWith('.')) {
						// Relative
						const basepath = this.var('*filename*').value as string
						return new URL(url, basepath).href
					} else {
						// Library
						const basepath = this.var('*libpath*').value as string
						return new URL(url, basepath).href
					}
				}
			}
		})()

		// Defining essential functions
		ReplCore.forEach(([name, exp]) => {
			this.def(name, jsToMal(exp))
		})

		this.defn('normalize-import-url', (url: MalVal) => {
			return MalString.create(normalizeImportURL(url.value as string))
		})

		this.defn('eval', (exp: MalVal) => {
			return evalExp(exp, this.env)
		})

		let filename: string,
			libpath = ''

		if (isNodeJS) {
			filename = __filename
		} else {
			filename = new URL('.', document.baseURI).href
			libpath = new URL('./lib/', document.baseURI).href
		}

		this.def('*filename*', MalString.create(filename))
		this.def('*libpath*', MalString.create(libpath))

		this.defn('import-force', (url: MalVal) => {
			const _url = url.value as string
			const pwd = this.var('*filename*') as MalString

			const absurl = normalizeImportURL(_url)
			const text = slurp(absurl)
			let exp: MalVal

			if (_url.endsWith('.js')) {
				eval(text)
				exp = (globalThis as any)['glisp_library']
			} else {
				exp = readStr(`(do ${text}\nnil)`)
			}

			this.def('*filename*', MalString.create(absurl))
			this.eval(exp)
			this.def('*filename*', pwd)

			return MalNil.create()
		})

		// Load core library as default
		this.REP('(import-force "core.glisp")')

		// Set the current filename to pwd
		if (isNodeJS) {
			this.def('*filename*', MalString.create(process.cwd()))
		}
	}
}
