import _ from 'lodash'

export interface Log {
	level: 'error' | 'warn' | 'info'
	reason: string
	error?: Error
}

export type WithLog<T> = [T, Log[]]

export function withLog<T>(result: T, log: Log[] = []): WithLog<T> {
	return [result, log]
}

export function composeWithLog<A, B, C>(
	f: (a: A) => WithLog<B>,
	g: (b: B) => WithLog<C>
): (a: A) => WithLog<C> {
	return (a: A) => {
		const [b, fLog] = f(a)
		const [c, gLog] = g(b)

		return withLog(c, [...fLog, ...gLog])
	}
}

export function flowWithLog<A, B, C>(
	input: A,
	f: (a: A) => WithLog<B>,
	g: (b: B) => WithLog<C>
): WithLog<C> {
	const [b, fLog] = f(input)
	const [c, gLog] = g(b)

	return withLog(c, [...fLog, ...gLog])
}

export function mapWithLog<A, R>(
	arr: A[],
	map: (a: A) => WithLog<R>
): WithLog<R[]> {
	const mapped = arr.map(map)
	const result = mapped.map(r => r[0])
	const log = mapped.flatMap(r => r[1])
	return [result, log]
}

export function mapValueWithLog<R, T>(
	dict: Record<string, R>,
	map: (a: R) => WithLog<T>
): WithLog<Record<string, T>> {
	const mapped = _.mapValues(dict, map)
	const result = _.mapValues(mapped, m => m[0])
	const log = _.values(mapped).flatMap(m => m[1])

	return [result, log]
}

export function logToString(log: Log[]) {
	return log.map(l => `[${l.level}] ${l.reason}`).join('\n')
}
