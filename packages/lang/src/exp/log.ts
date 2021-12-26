import {Writer} from '../utils/Writer'
import type {Exp, Value} from './exp'

export type WithLog = Writer<Value, Log>

export interface Log {
	level: 'error' | 'warn' | 'info'
	reason: string
	ref?: Exp
}

export function withLog(value: Value, ...log: Log[]): WithLog {
	return Writer.of(value, ...log)
}
