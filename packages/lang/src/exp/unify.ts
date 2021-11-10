import {mapValues} from 'lodash'

import {zip} from '../utils/zip'
import * as Val from '../val'

export type Const = [Val.Value, Val.Value]

type SubstMap = Map<Val.TyVar, Val.Value>

export class Subst {
	private constructor(private lower: SubstMap, private upper: SubstMap) {}

	public appendLower(tv: Val.TyVar, lower: Val.Value) {
		const subst = this.clone()
		let l = lower

		l = Val.uniteTy(l, subst.getLower(tv))

		const u = subst.getUpper(tv)
		if (!l.isSubtypeOf(u)) {
			// Copy lower to upper
			subst.upper.set(tv, l)
		}

		subst.lower.set(tv, l)

		return subst
	}

	public getLower(tv: Val.TyVar) {
		return this.lower.get(tv) ?? Val.bottom
	}

	public appendUpper(tv: Val.TyVar, upper: Val.Value) {
		const subst = this.clone()
		let u = upper

		u = Val.intersectTy(u, subst.getUpper(tv))

		const l = subst.getLower(tv)
		if (!l.isSubtypeOf(u)) {
			// Copy lower to upper
			u = l
		}

		subst.upper.set(tv, u)

		return subst
	}

	public getUpper(tv: Val.TyVar) {
		return this.upper.get(tv) ?? Val.all
	}

	public applyTo(val: Val.Value): Val.Value {
		switch (val.type) {
			case 'tyVar': {
				return this.lower.get(val) ?? val
			}
			case 'tyFn': {
				const param = val.tyParam.map(p => this.inverted.applyTo(p))
				const out = this.applyTo(val.tyOut)
				return Val.tyFn(param, out)
			}
			case 'fn': {
				const param = mapValues(val.param, p => this.inverted.applyTo(p))
				const out = this.applyTo(val.out)
				return Val.fn(val.fn, param, out)
			}
			case 'vec': {
				const items = val.items.map(this.applyTo)
				const rest = val.rest ? this.applyTo(val.rest) : null
				return Val.vecFrom(items, rest)
			}
			default:
				return val
		}
	}

	public clone() {
		const lower = new Map(this.lower.entries())
		const upper = new Map(this.upper.entries())
		return new Subst(lower, upper)
	}

	public get inverted() {
		return new Subst(this.upper, this.lower)
	}

	public print() {
		const tvs = [...new Set([...this.lower.keys(), ...this.upper.keys()])]
		const strs = tvs.map(tv => {
			const l = this.getLower(tv).print()
			const x = tv.print()
			const u = this.getUpper(tv).print()
			return [l, x, u].join(' <: ')
		})

		return '[' + strs.join(', ') + ']'
	}

	public static empty() {
		return new Subst(new Map(), new Map())
	}
}

export function getTyVars(val: Val.Value): Set<Val.TyVar> {
	switch (val.type) {
		case 'tyVar':
			return new Set([val])
		case 'tyUnion': {
			const tvs = val.types.map(ty => [...getTyVars(ty)]).flat()
			return new Set(tvs)
		}
		case 'tyFn': {
			const param = val.tyParam.map(ty => [...getTyVars(ty)]).flat()
			const out = getTyVars(val.tyOut)
			return new Set([...param, ...out])
		}
		case 'vec': {
			const items = val.items.map(ty => [...getTyVars(ty)]).flat()
			const rest = val.rest ? [...getTyVars(val.rest)] : []
			return new Set([...items, ...rest])
		}
		default:
			return new Set()
	}
}

export function replaceTyVars(
	val: Val.Value,
	table: Map<Val.TyVar, Val.TyVar>
): Val.Value {
	switch (val.type) {
		case 'tyVar': {
			return table.get(val) ?? val
		}
		case 'tyUnion': {
			const types = val.types.map(t => replaceTyVars(t, table))
			return Val.uniteTy(...types)
		}
		case 'tyFn': {
			const param = val.tyParam.map(p => replaceTyVars(p, table))
			const out = replaceTyVars(val.tyOut, table)
			return Val.tyFn(param, out)
		}
		case 'fn': {
			const param = mapValues(val.param, p => replaceTyVars(p, table))
			const out = replaceTyVars(val.out, table)
			return Val.fn(val.fn, param, out)
		}
		case 'vec': {
			const items = val.items.map(it => replaceTyVars(it, table))
			const rest = val.rest ? replaceTyVars(val.rest, table) : null
			return Val.vecFrom(items, rest)
		}
		default:
			return val
	}
}

export function createFreshTyVarsTable(
	...vals: Val.Value[]
): [Map<Val.TyVar, Val.TyVar>, Map<Val.TyVar, Val.TyVar>] {
	const tvs = [...new Set(vals.flatMap(v => [...getTyVars(v)]))]
	const entries = tvs.map(tv => [tv, tv.shadow()] as [Val.TyVar, Val.TyVar])
	const entriesRev = entries.map(
		([t1, t2]) => [t2, t1] as [Val.TyVar, Val.TyVar]
	)
	const map = new Map(entries)
	const mapRev = new Map(entriesRev)
	return [map, mapRev]
}

export function useFreshTyVars(val: Val.Value): Val.Value {
	let subst = Subst.empty()

	for (const tv of getTyVars(val)) {
		if (tv.shadowed) continue
		const tv2 = tv.duplicate()
		subst = subst.appendLower(tv, tv2)
		subst = subst.appendUpper(tv, tv2)
	}

	return subst.applyTo(val)
}

export function unify(consts: Const[]): Subst {
	if (consts.length === 0) return Subst.empty()

	const [[s, t], ...rest] = consts

	// Match constraints spawing sub-constraints
	if (t.type === 'tyFn') {
		let param: Const, out: Const
		if (!('tyFn' in s)) {
			param = [
				Val.vecFrom(t.tyParam),
				Val.vecFrom(t.tyParam.map(() => Val.all)),
			]
			out = [Val.bottom, t.tyFn.tyOut]
		} else {
			param = [Val.vecFrom(t.tyParam), Val.vecFrom(s.tyFn.tyParam)]
			out = [s.tyFn.tyOut, t.tyOut]
		}

		return unify([param, out, ...rest])
	}

	if (t.type === 'vec') {
		let svec: Val.Vec
		if (s.type !== 'vec') {
			const items = t.items.map(() => Val.bottom)
			const rest = t.rest ? Val.bottom : null
			svec = Val.vecFrom(items, rest)
		} else {
			svec = s
		}

		const items: Const[] = zip(svec.items, t.items)

		if (t.rest) {
			const tr = t.rest
			const rest: Const[] = svec.items.slice(t.length).map(si => [si, tr])

			if (svec.rest) rest.push([svec.rest, tr])

			items.push(...rest)
		}

		return unify([...items, ...rest])
	}

	// If either type is tyVar?
	let unified = unify(rest)

	if (s.isEqualTo(t)) return unified

	if (t.type === 'tyVar') {
		if (getTyVars(s).has(t)) {
			throw new Error('Failed to occur check')
		}

		unified = unified.appendLower(t, s)
	}

	if (s.type === 'tyVar') {
		if (getTyVars(t).has(s)) {
			throw new Error('Failed to occur check')
		}

		unified = unified.appendUpper(s, t)
	}

	return unified
}
