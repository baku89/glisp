import Env from './env'
import readStr, {jsToMal, MalBlankException} from './reader'
import evalExp from './eval'
import initReplScope from './init-repl-scope'
import {MalVal, MalError, MalNil, MalCallableValue} from './types'
import {printer} from './printer'

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

	public def(
		name: string,
		value: MalVal | number | string | boolean | MalCallableValue | any
	) {
		this.env.set(name, jsToMal(value as any))
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
		initReplScope(this)
	}
}
