import {values} from 'lodash'

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
		this.lower.set(tv, l)

		return this
	}

	public getLower(tv: Val.TyVar) {
		return this.lower.get(tv) ?? Val.bottom
	}

	public applyLower(val: Val.Value): Val.Value {
		switch (val.type) {
			case 'tyVar': {
				const tv = this.lower.get(val)
				return tv ?? val
			}
			case 'tyFn': {
				const param = val.param.map(p => this.applyLower(p))
				const out = this.applyLower(val.out)
				return Val.tyFn(param, out)
			}
			default:
				return val
		}
	}

	public print() {
		const tvs = [...this.lower.keys()]
		const strs = tvs.map(tv => this.getLower(tv).print() + '<:' + tv.print())

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
			const param = val.param.map(ty => [...getTyVars(ty)]).flat()
			const out = getTyVars(val.out)
			return new Set([...param, ...out])
		}
		default:
			return new Set()
	}
}

export function unifyLower(consts: Const[]): Subst {
	if (consts.length === 0) return Subst.empty()

	const [[s, t], ...rest] = consts

	if (t.type === 'tyVar') {
		if (getTyVars(s).has(t)) {
			throw new Error('Failed to occur check')
		}

		return unifyLower(rest).appendLower(t, s)
	}

	if (t.type === 'tyFn') {
		let sParam: Val.Value[], sOut: Val.Value
		if (s.type === 'fn') {
			sParam = values(s.tyParam)
			sOut = s.tyOut
		} else if (s.type === 'tyFn') {
			sParam = s.param
			sOut = s.out
		} else {
			throw new Error('Not yet implemented')
		}

		// NOTE: paramは反変では?
		const param: Const[] = t.param.map((tp, i) => [sParam[i], tp])
		const out: Const = [sOut, t.out]

		return unifyLower([...param, out, ...rest])
	}

	if (s.type === 'tyVar') {
		throw new Error('Not yet implemented: ' + s.print() + ' <:' + t.print())
	}

	return unifyLower(rest)
}

export function inferPoly(val: Val.Value, consts: Const[]): Val.Value {
	return unifyLower(consts).applyLower(val)
}
