import {isEqualWith} from 'lodash'

import {hasEqualValues} from '../utils/hasEqualValues'
import {nullishEqual} from '../utils/nullishEqual'
import {zip} from '../utils/zip'
import * as Val from '../val'
import {
	App,
	Fn,
	Log,
	Node,
	NodeWithLog,
	Obj,
	Scope,
	Sym,
	TyFn,
	Type,
	ValueWithLog,
	Vec,
} from './exp'

export {Node}

export {Sym, Obj, Fn, TyFn, Vec, App, Scope}

export {Type, Log, ValueWithLog, NodeWithLog}

// Shorthands
export const sym = Sym.of
export const obj = Obj.of
export const fn = Fn.of
export const tyFn = TyFn.of
export const vec = Vec.of
export const vecFrom = Vec.from
export const app = App.of
export const scope = Scope.of

export const int = (v: number) => Obj.of(Val.int(v))
export const str = (v: string) => Obj.of(Val.str(v))

export function isEqual(a: Node, b: Node): boolean {
	switch (a.type) {
		case 'sym':
			return b.type === 'sym' && a.name === b.name
		case 'obj':
			return b.type === a.type && a.value.isEqualTo(b.value)
		case 'vec':
			return (
				b.type === 'vec' &&
				a.length === b.length &&
				nullishEqual(a.rest, b.rest, isEqual) &&
				zip(a.items, b.items).every(([ai, bi]) => isEqual(ai, bi))
			)
		case 'fn':
			return (
				b.type === 'fn' &&
				hasEqualValues(a.param, b.param, isEqual) &&
				isEqual(a.body, b.body)
			)
		case 'tyFn': {
			return (
				b.type === 'tyFn' &&
				a.tyParam.length === b.tyParam.length &&
				zip(a.tyParam, b.tyParam).every(([ap, bp]) => isEqual(ap, bp)) &&
				isEqual(a.out, b.out)
			)
		}
		case 'app':
			return b.type === 'app' && isEqualWith(a.args, b.args, isEqual)
		case 'scope': {
			return (
				b.type === 'scope' &&
				nullishEqual(a.out, b.out, isEqual) &&
				hasEqualValues(a.vars, b.vars, isEqual)
			)
		}
	}
}
