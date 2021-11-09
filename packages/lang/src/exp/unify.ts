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

		if (l.type === 'tyVar') {
			l = subst.lower.get(l) ?? l
		}

		for (const [t, v] of subst.lower) {
			if (v.isEqualTo(tv)) {
				subst.lower.set(t, l)
			}
		}

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

		if (u.type === 'tyVar') {
			u = subst.upper.get(u) ?? u
		}

		for (const [t, v] of subst.upper) {
			if (v.isEqualTo(tv)) {
				subst.upper.set(t, u)
			}
		}

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
				return this.lower.get(val) ?? Val.bottom
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
				return rest ? Val.vecV(...items, rest) : Val.vec(...items)
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

export function useFreshTyVars(val: Val.Value): Val.Value {
	let subst = Subst.empty()

	for (const tv of getTyVars(val)) {
		subst = subst.appendLower(tv, Val.freshTyVar())
		subst = subst.appendUpper(tv, Val.freshTyVar())
	}

	return subst.applyTo(val)
}

export function unify(consts: Const[]): Subst {
	if (consts.length === 0) return Subst.empty()

	const [[s, t], ...rest] = consts

	if (s.type === 'bottom' || t.type === 'all') {
		return unify(rest)
	}

	const svars = getTyVars(s)
	const tvars = getTyVars(t)

	if (svars.size === 0 && tvars.size === 0) {
		return unify(rest)
	}

	// Match constraints spawing sub-constraints
	if (t.type === 'tyFn') {
		if (!('tyFn' in s)) {
			return unify(rest)
		}

		const param: Const = [Val.vec(...t.tyParam), Val.vec(...s.tyFn.tyParam)]
		const out: Const = [s.tyFn.tyOut, t.tyOut]

		return unify([param, out, ...rest])
	}

	if (t.type === 'vec') {
		if (s.type !== 'vec') {
			return unify(rest)
		}

		const items: Const[] = zip(s.items, t.items)

		if (t.rest) {
			const tr = t.rest
			const rest: Const[] = s.items.slice(t.length).map(si => [si, tr])

			if (s.rest) rest.push([s.rest, tr])

			items.push(...rest)
		}

		return unify([...items, ...rest])
	}

	// If either type is tyVar?
	if (t.type === 'tyVar') {
		if (svars.has(t)) {
			throw new Error('Failed to occur check')
		}

		return unify(rest).appendLower(t, s)
	}

	if (s.type === 'tyVar') {
		if (tvars.has(s)) {
			throw new Error('Failed to occur check')
		}

		return unify(rest).appendUpper(s, t)
	}

	throw new Error('Not yet implemented')
}
