import _ from 'lodash'

export interface Log {
	level: 'error' | 'warn' | 'info'
	reason: string
	error?: Error
}

export interface WithLog<T> {
	result: T
	log: Log[]
}

export function withLog<T>(result: T, log: Log[] = []) {
	return {result, log}
}

export function composeWithLog<A, B, C>(
	f: (a: A) => WithLog<B>,
	g: (b: B) => WithLog<C>
): (a: A) => WithLog<C> {
	return (a: A) => {
		const {result: b, log: fLog} = f(a)
		const {result: c, log: gLog} = g(b)

		return withLog(c, [...fLog, ...gLog])
	}
}

export function flowWithLog<A, B, C>(
	input: A,
	f: (a: A) => WithLog<B>,
	g: (b: B) => WithLog<C>
): WithLog<C> {
	const {result: b, log: fLog} = f(input)
	const {result: c, log: gLog} = g(b)

	return withLog(c, [...fLog, ...gLog])
}

export function mapWithLog<A, R>(
	arr: A[],
	map: (a: A) => WithLog<R>
): WithLog<R[]> {
	const mapped = arr.map(map)
	const result = mapped.map(r => r.result)
	const log = mapped.flatMap(r => r.log)
	return {result, log}
}

export function mapValueWithLog<R, T>(
	dict: Record<string, R>,
	map: (a: R) => WithLog<T>
): WithLog<Record<string, T>> {
	const mapped = _.mapValues(dict, map)
	const result = _.mapValues(mapped, m => m.result)
	const log = _.values(mapped).flatMap(m => m.log)

	return {result, log}
}
