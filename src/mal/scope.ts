import Env from './env'
import evalExp from './eval'
import initReplScope from './init-repl-scope'
import {printer} from './printer'
import readStr, {MalBlankException, readJS} from './reader'
import {MalCallableValue, MalError, MalNil, MalVal} from './types'

export default class Scope {
	public env!: Env

	private inner!: Scope

	constructor(
		private outer: Scope | undefined = undefined,
		private name = 'repl',
		private onSetup: ((scope: Scope, option: any) => any) | null = null
	) {
		this.setup()

		if (this.outer) {
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

	public async REP(str: string): Promise<void> {
		const ret = await this.readEval(str)
		if (ret !== undefined) {
			printer.return(ret.print())
		}
	}

	public async readEval(str: string): Promise<MalVal | undefined> {
		try {
			return await this.eval(readStr(str))
		} catch (err) {
			if (err instanceof MalBlankException) {
				return MalNil.from()
			}

			if (err instanceof MalError) {
				printer.error(err)
			} else {
				printer.error(err.stack)
			}

			return undefined
		}
	}

	public async eval(exp: MalVal): Promise<MalVal | undefined> {
		try {
			return await evalExp(exp, this.env)
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
		this.env.set(name, readJS(value as any))
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

	private async initAsRepl() {
		await initReplScope(this)
	}

	public static async createRepl() {
		const scope = new Scope()
		await scope.initAsRepl()
		return scope
	}
}
