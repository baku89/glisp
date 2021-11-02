import {mapValues, values} from 'lodash'

export type WithLog<V, L> = {
	result: V
	log: L[]
}

export function withLog<V, L>(result: V, log: L[] = []): WithLog<V, L> {
	return {result, log}
}

export function composeWithLog<A, B, C, L>(
	f: (a: A) => WithLog<B, L>,
	g: (b: B) => WithLog<C, L>
): (a: A) => WithLog<C, L> {
	return (a: A) => {
		const {result: b, log: fLog} = f(a)
		const {result: c, log: gLog} = g(b)

		return withLog(c, [...fLog, ...gLog])
	}
}

export function flowWithLog<A, B, C, L>(
	input: A,
	f: (a: A) => WithLog<B, L>,
	g: (b: B) => WithLog<C, L>
): WithLog<C, L> {
	const {result: b, log: fLog} = f(input)
	const {result: c, log: gLog} = g(b)

	return withLog(c, [...fLog, ...gLog])
}

export function mapWithLog<A, R, L>(
	arr: A[],
	map: (a: A) => WithLog<R, L>
): WithLog<R[], L> {
	const mapped = arr.map(map)
	const result = mapped.map(r => r.result)
	const log = mapped.flatMap(r => r.log)
	return withLog(result, log)
}

export function mapValueWithLog<R, T, L>(
	dict: Record<string, R>,
	map: (a: R) => WithLog<T, L>
): WithLog<Record<string, T>, L> {
	const mapped = mapValues(dict, map)
	const result = mapValues(mapped, m => m.result)
	const log = values(mapped).flatMap(m => m.log)

	return withLog(result, log)
}
