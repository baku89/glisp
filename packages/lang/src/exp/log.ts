import {Writer} from '../utils/Writer'
import type {Node, Value} from './exp'

export type WithLog = Writer<Value, Log>

export interface Log {
	level: 'error' | 'warn' | 'info'
	reason: string
	ref?: Node
}

export function withLog(value: Value, ...log: Log[]): WithLog {
	return Writer.of(value, ...log)
}
