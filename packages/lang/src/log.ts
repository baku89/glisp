import type {Node} from './ast'
import {Writer} from './utils/Writer'
import * as Val from './val'

export type WithLog = Writer<Val.Value, Log>

export interface Log {
	level: 'error' | 'warn' | 'info'
	reason: string
	ref?: Node
}

export function withLog(value: Val.Value, ...log: Log[]): WithLog {
	return Writer.of(value, ...log)
}
