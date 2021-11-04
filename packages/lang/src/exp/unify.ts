import * as Val from '../val'

export type Const = [Val.Value, Val.Value]
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

export function resolveLowerConsts(tv: Val.TyVar, consts: Const[]): Val.Value {
	let lower: Val.Value = Val.bottom

	const restConsts: Const[] = []

	for (const [s, t] of consts) {
		if (t.isEqualTo(tv)) {
			lower = Val.uniteTy(lower, s)
			continue
		}
		if (s.isEqualTo(tv)) {
			if (!lower.isSubtypeOf(t)) {
				throw new Error('Invalid consts')
			}
		}
		restConsts.push([s, t])
	}

	if (getTyVars(lower).size === 0) {
		return lower
	}

	// Has free tyVars
	if (lower.type !== 'tyVar') throw new Error('Not yet implemented')

	return resolveLowerConsts(lower, restConsts)
}
