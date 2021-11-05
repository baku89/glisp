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
		default:
			return new Set()
	}
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
		if (!Val.isTyFn(s)) {
			throw new Error('Not yet implemented')
		}

		if (s.tyParam.length > t.tyParam.length) {
			throw new Error('Subtype expects too many parameters')
		}

		const param: Const[] = zip(t.tyParam, s.tyParam)
		const out: Const = [s.tyOut, t.tyOut]

		return unify([...param, out, ...rest])
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

export function infer(val: Val.Value, consts: Const[]): Val.Value {
	return unify(consts).applyTo(val)
}
