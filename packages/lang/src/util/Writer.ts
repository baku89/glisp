import {mapValues, values} from 'lodash'

export class Writer<T, L> {
	private constructor(public result: T, public log: Set<L>) {}

	public get asTuple(): [T, Set<L>] {
		return [this.result, this.log]
	}

	public bind<U>(f: (v: T) => Writer<U, L>): Writer<U, L> {
		const {result, log} = f(this.result)
		return new Writer(result, new Set([...this.log, ...log]))
	}

	public fmap<U>(f: (v: T) => U): Writer<U, L> {
		return new Writer(f(this.result), this.log)
	}

	public write(...logs: L[]) {
		return new Writer(this.result, new Set([...this.log, ...logs]))
	}

	public static of<T, L>(result: T, ...log: L[]) {
		return new Writer(result, new Set(log))
	}

	public static map<T, U, L>(
		arr: T[],
		f: (v: T, index: number) => Writer<U, L>
	): Writer<U[], L> {
		const writers = arr.map(f)
		const result = writers.map(w => w.result)
		const log = writers.flatMap(w => [...w.log])
		return new Writer(result, new Set(log))
	}

	public static mapValues<T, U, L>(
		obj: Record<string, T>,
		f: (v: T) => Writer<U, L>
	) {
		const writers = mapValues(obj, f)
		const result = mapValues(writers, w => w.result)
		const log = values(writers).flatMap(w => [...w.log])
		return new Writer(result, new Set(log))
	}
}
