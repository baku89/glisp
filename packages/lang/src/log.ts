import type {Node} from './ast'
import {Writer} from './util/Writer'
import * as Val from './val'

export type WithLog<V extends Val.Value = Val.Value> = Writer<V, Log>

export interface Log {
	level: 'error' | 'warn' | 'info'
	reason: string
	ref?: Node
}

export function withLog<V extends Val.Value = Val.Value>(
	value: V,
	...log: Log[]
): WithLog<V> {
	return Writer.of(value, ...log)
}
