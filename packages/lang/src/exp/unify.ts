import * as Val from '../val'

export type Const = [Val.Value, Val.Value]

type SubstMap = Map<Val.TyVar, Val.Value>

export class Subst {
	private constructor(private lower: SubstMap, private upper: SubstMap) {}

	public appendLower(tv: Val.TyVar, lower: Val.Value) {
		let l = lower

		if (l.type === 'tyVar') {
			l = this.lower.get(l) ?? l
		}

		for (const [t, v] of this.lower) {
			if (v.isEqualTo(tv)) {
				this.lower.set(t, l)
			}
		}

		l = Val.uniteTy(l, this.getLower(tv))

		const u = this.getUpper(tv)
		if (!l.isSubtypeOf(u)) {
			throw new Error('Invalid subst')
		}

		this.lower.set(tv, l)

		return this
	}

	public getLower(tv: Val.TyVar) {
		return this.lower.get(tv) ?? Val.bottom
	}

	public appendUpper(tv: Val.TyVar, upper: Val.Value) {
		let u = upper

		if (u.type === 'tyVar') {
			u = this.upper.get(u) ?? u
		}

		for (const [t, v] of this.upper) {
			if (v.isEqualTo(tv)) {
				this.upper.set(t, u)
			}
		}

		u = Val.intersectTy(u, this.getUpper(tv))

		const l = this.getLower(tv)
		if (!l.isSubtypeOf(u)) {
			throw new Error('Invalid subst')
		}

		this.upper.set(tv, u)

		return this
	}

	public getUpper(tv: Val.TyVar) {
		return this.upper.get(tv) ?? Val.all
	}

	public applyLower(val: Val.Value): Val.Value {
		switch (val.type) {
			case 'tyVar': {
				const l = this.lower.get(val)
				const u = this.upper.get(val)
				return l ?? u ?? val
			}
			case 'tyFn': {
				const param = val.tyParam.map(p => this.applyLower(p))
				const out = this.applyLower(val.tyOut)
				return Val.tyFn(param, out)
			}
			default:
				return val
		}
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

	public static fromLowers(...lowers: [Val.TyVar, Val.Value][]) {
		return new Subst(new Map(lowers), new Map())
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

	if (t.type === 'tyVar') {
		if (getTyVars(s).has(t)) {
			throw new Error('Failed to occur check')
		}

		return unify(rest).appendLower(t, s)
	}

	if (t.type === 'tyFn') {
		if (s.type !== 'fn' && s.type !== 'tyFn') {
			throw new Error('Not yet implemented')
		}

		const param: Const[] = t.tyParam.map((tp, i) => [tp, s.tyParam[i]])
		const out: Const = [s.tyOut, t.tyOut]

		return unify([...param, out, ...rest])
	}

	if (s.type === 'tyVar') {
		if (getTyVars(t).has(s)) {
			throw new Error('Failed to occur check')
		}

		return unify(rest).appendUpper(s, t)
	}

	return unify(rest)
}

export function inferPoly(val: Val.Value, consts: Const[]): Val.Value {
	return unify(consts).applyLower(val)
}
