import {values} from 'lodash'

import * as Val from '../val'

export type Const = [Val.Value, Val.Value]
export type Subst = Map<Val.TyVar, Val.Value>

export function applySubst(val: Val.Value, subst: Subst): Val.Value {
	switch (val.type) {
		case 'tyVar': {
			const tv = subst.get(val)
			return tv ?? val
		}
		case 'tyFn': {
			const param = val.param.map(p => applySubst(p, subst))
			const out = applySubst(val.out, subst)
			return Val.tyFn(param, out)
		}
		default:
			return val
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

function consSubst(tv: Val.TyVar, val: Val.Value, subst: Subst): Subst {
	let newVal = val
	if (val.type === 'tyVar') {
		newVal = subst.get(val) ?? val
	}

	for (const [t, v] of subst) {
		if (v.isEqualTo(tv)) {
			subst.set(t, newVal)
		}
	}

	const prevVal = subst.get(tv) ?? Val.bottom
	newVal = Val.uniteTy(newVal, prevVal)
	subst.set(tv, newVal)

	return subst
}

export function unifyLower(consts: Const[]): Subst {
	if (consts.length === 0) return new Map()

	const [[s, t], ...rest] = consts

	if (t.type === 'tyVar') {
		if (getTyVars(s).has(t)) {
			throw new Error('Failed to occur check')
		}

		const restSubsts = unifyLower(rest)
		return consSubst(t, s, restSubsts)
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
	return applySubst(val, unifyLower(consts))
}
