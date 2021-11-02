export class Writer<T, L> {
	private constructor(public result: T, public log: L[]) {}

	public bind<U>(f: (v: T) => Writer<U, L>): Writer<U, L> {
		const {result, log} = f(this.result)
		return new Writer(result, [...this.log, ...log])
	}

	public fmap<U>(f: (v: T) => U): Writer<U, L> {
		return new Writer(f(this.result), this.log)
	}

	public tell(...log: L[]): Writer<T, L> {
		return new Writer(this.result, [...this.log, ...log])
	}

	public static return<T, L>(result: T) {
		return new Writer<T, L>(result, [])
	}

	public static of<T, L>(result: T, ...log: L[]) {
		return new Writer(result, log)
	}

	public static map<T, U, L>(
		arr: T[],
		f: (v: T) => Writer<U, L>
	): Writer<U[], L> {
		const writers = arr.map(f)
		const result = writers.map(w => w.result)
		const log = writers.flatMap(w => w.log)
		return new Writer(result, log)
	}
}
