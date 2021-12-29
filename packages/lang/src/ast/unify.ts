import {mapValues, values} from 'lodash'

import {union} from '../util/SetOperation'
import {zip} from '../util/zip'
import {
	all,
	bottom,
	dict,
	fnFrom,
	isEqual,
	tyDifference,
	TyFn,
	tyFnFrom,
	tyIntersection,
	tyUnion,
	TyVar,
	Value,
	vec,
	vecFrom,
} from '../val'

export type Const = [Value, Relation, Value]

type Relation = '<=' | '>=' | '=='

function invRelation(op: Relation): Relation {
	if (op === '<=') return '>='
	if (op === '>=') return '<='
	return '=='
}

export function getTyVars(ty: Value): Set<TyVar> {
	switch (ty.type) {
		case 'tyVar':
			return new Set([ty])
		case 'tyUnion':
			return union(...ty.types.map(getTyVars))
		case 'tyFn': {
			const param = values(ty.param).map(getTyVars)
			const out = getTyVars(ty.out)
			return union(...param, out)
		}
		case 'fn':
			return getTyVars(ty.superType)
		case 'vec': {
			const items = ty.items.map(getTyVars)
			const rest: Set<TyVar> = ty.rest ? getTyVars(ty.rest) : new Set()
			return union(...items, rest)
		}
		case 'dict': {
			const items = values(ty.items).map(getTyVars)
			const rest: Set<TyVar> = ty.rest ? getTyVars(ty.rest) : new Set()
			return union(...items, rest)
		}
		default:
			return new Set()
	}
}

export function shadowTyVars(ty: Value) {
	const unifier = new Unifier()

	for (const tv of getTyVars(ty)) {
		const shadowed = tv.shadow()
		unifier.mapTo(tv, shadowed)
	}

	return unifier.substitute(ty)
}

export class Unifier {
	#lowers = new Map<TyVar, Value>()
	#uppers = new Map<TyVar, Value>()
	#isEmpty = true

	constructor(...consts: Const[]) {
		this.#addConsts(...consts)
	}

	#getLower(tv: TyVar) {
		return this.#lowers.get(tv) ?? bottom
	}

	#getUpper(tv: TyVar) {
		return this.#uppers.get(tv) ?? all
	}

	#setLower(tv: TyVar, l: Value) {
		this.#isEmpty = false
		const nl = tyUnion(l, this.#getLower(tv))
		this.#lowers.set(tv, nl)
		this.#normalizeRange(tv)
	}

	#setUpper(tv: TyVar, u: Value) {
		this.#isEmpty = false
		const nu = tyIntersection(u, this.#getUpper(tv))
		this.#uppers.set(tv, nu)
		this.#normalizeRange(tv)
	}

	#setEqual(tv: TyVar, e: Value) {
		this.#isEmpty = false
		const nl = tyUnion(e, this.#getLower(tv))
		this.#lowers.set(tv, nl)

		const nu = tyIntersection(e, this.#getUpper(tv))
		this.#uppers.set(tv, nu)

		this.#normalizeRange(tv)
	}

	/**
	 * α |-> [S, T] が S <: Tとならない場合に、無理矢理解決する
	 * @param tv
	 * @returns
	 */
	#normalizeRange(tv: TyVar) {
		const l = this.#getLower(tv)
		const u = this.#getUpper(tv)

		if (l.isSubtypeOf(u)) return

		const ltvs = getTyVars(l)
		const utvs = getTyVars(u)
		if (ltvs.size === 0 && utvs.size === 0) {
			/**
			 * When both limits have no tyVars (e.g. α |-> [Num, Bool]),
			 * simply copy lower to upper
			 **/
			this.#uppers.set(tv, l)
			return
		}

		const subUnifier = new Unifier()
		if (utvs.size === 0 || l.type === 'tyVar') {
			// α |-> [(has tyVars), (no tyvar)]
			// α |-> [<T>, ...]
			subUnifier.#addConsts([l, '==', u])
		} else if (ltvs.size === 0 || u.type === 'tyVar') {
			// α |-> [(no tyVar), (has tyVar)]
			// α |-> [..., <T>]
			subUnifier.#addConsts([u, '==', l])
		} else {
			// NOTE: In this case the algorithm won't work
			subUnifier.#addConsts([u, '==', l])
		}

		// Then merge the new subst
		this.#mergeWith(subUnifier)
	}

	#mergeWith(unifier: Unifier) {
		// Eliminate surplus tyVars from this subst
		for (const [tv, l] of this.#lowers) {
			this.#lowers.set(tv, unifier.substitute(l))
		}
		for (const [tv, u] of this.#uppers) {
			this.#uppers.set(tv, unifier.substitute(u))
		}

		for (const [tv, l] of unifier.#lowers) {
			if (this.#lowers.has(tv)) throw new Error('Cannot merge substs')
			this.#lowers.set(tv, l)
		}
		for (const [tv, u] of unifier.#uppers) {
			if (this.#uppers.has(tv)) throw new Error('Cannot merge substs')
			this.#uppers.set(tv, u)
		}
	}

	mapTo(tv: TyVar, l: Value) {
		this.#setLower(tv, l)
	}

	#addConsts(...consts: Const[]): Unifier {
		if (consts.length === 0) return this

		const [[t, R, u], ...cs] = consts

		if (isEqual(t, u)) {
			return this.#addConsts(...cs)
		}

		const Ri = invRelation(R)

		// Match constraints spawing sub-constraints

		/**
		 * tp R' up /\ to R tp
		 *--------------------- ST-TyFn
		 * tp -> to R up -> uo
		 */
		if (t.type === 'tyFn' && 'tyFn' in u) {
			const tParam = vec(...values(t.param))
			const uParam = vec(...values(u.tyFn.param))

			const tOut = t.out
			const uOut = u.tyFn.out

			const cParam: Const = [tParam, Ri, uParam]
			const cOut: Const = [tOut, R, uOut]

			return this.#addConsts(cParam, cOut, ...cs)
		}

		/**
		 *  t1 R u1 /\ t2 R u2 /\ ...
		 * --------------------------- ST-Vec
		 *    [...ts] R [...us]
		 */
		if (t.type === 'vec' && u.type === 'vec') {
			const uItems = u.items

			const cItems = zip(t.items, u.items).map(
				([ti, ui]) => [ti, R, ui] as Const
			)

			let cRest: Const[] = []
			if (t.rest) {
				cRest = uItems.slice(t.items.length).map(ui => [t.rest, R, ui] as Const)
				if (u.rest) {
					cRest.push([t.rest, R, u.rest])
				}
			}

			return this.#addConsts(...cItems, ...cRest, ...cs)
		}

		/**
		 *  t1 R (u - (t - t1)) /\
		 *  t2 R (u - (t - t2)) /\ ...
		 * --------------------------- ST-Union
		 *     t1 | t2... R u
		 */
		if (t.type === 'tyUnion') {
			const cUnion: Const[] = t.types.map(ti => {
				const tRest = tyDifference(t, ti)
				const ui = tyDifference(u, tRest)
				return [ti, R, ui]
			})

			return this.#addConsts(...cUnion, ...cs)
		}

		// Finally set limits
		if (t.type === 'tyVar') {
			if (getTyVars(u).has(t)) throw new Error('Occur check')

			const Su = this.substitute(u)

			if (R === '<=') this.#setUpper(t, Su)
			if (R === '>=') this.#setLower(t, Su)
			if (R === '==') this.#setEqual(t, Su)

			return this.#addConsts(...cs)
		}

		if (u.type === 'tyVar') {
			return this.#addConsts([u, Ri, t], ...cs)
		}

		return this.#addConsts(...cs)
	}

	substitute = (val: Value, unshadow = false): Value => {
		if (this.#isEmpty) return val

		switch (val.type) {
			case 'tyVar': {
				const v = this.#lowers.get(val) ?? this.#uppers.get(val) ?? val
				return unshadow && v.type === 'tyVar' ? v.unshadow() : v
			}
			case 'tyFn': {
				const param = mapValues(val.param, p => this.substitute(p, unshadow))
				const out = this.substitute(val.out, unshadow)
				return tyFnFrom(param, out)
			}
			case 'tyUnion': {
				const types = val.types.map(ty => this.substitute(ty, unshadow))
				return tyUnion(...types)
			}
			case 'fn':
				return fnFrom(this.substitute(val.superType, unshadow) as TyFn, val.fn)
			case 'vec': {
				const items = val.items.map(it => this.substitute(it, unshadow))
				const rest = val.rest ? this.substitute(val.rest, unshadow) : undefined
				return vecFrom(items, rest)
			}
			case 'dict': {
				const items = mapValues(val.items, it => this.substitute(it, unshadow))
				const rest = val.rest ? this.substitute(val.rest, unshadow) : undefined
				return dict(items, val.optionalKeys, rest)
			}
			default:
				return val
		}
	}

	print() {
		const tvs = [...new Set([...this.#lowers.keys(), ...this.#uppers.keys()])]
		const strs = tvs.map(tv => {
			const x = tv.print()
			const l = this.#getLower(tv).print()
			const u = this.#getUpper(tv).print()
			return `${x} |-> [${l}, ${u}]`
		})

		return '[' + strs.join(', ') + ']'
	}
}
