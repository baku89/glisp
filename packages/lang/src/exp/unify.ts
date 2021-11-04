import * as Val from '../val'

export type Const = {
	a: Val.Value
	b: Val.Value
	op: '<:' | '='
}

export type Subst = [Val.TyVar, Val.Value]

export function applySubst(val: Val.Value, subst: Subst): Val.Value {
	const [s, t] = subst
	if (s.isEqualTo(val)) {
		return t
	}

	if (val.type === 'tyFn') {
		const param = val.param.map(p => applySubst(p, subst))
		const out = applySubst(val.out, subst)
		return Val.tyFn(param, out)
	}

	return val
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
