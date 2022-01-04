import {mapValues, values} from 'lodash'

import {union} from '../util/SetOperation'
import {zip} from '../util/zip'
import {
	all,
	dict,
	differenceType,
	fnFrom,
	FnType,
	fnTypeFrom,
	intersectionType,
	isEqual,
	never,
	TypeVar,
	unionType,
	Value,
	vec,
	vecFrom,
} from '../val'
import {createFoldFn} from '../val/walk'

export type Const = [Value, Relation, Value]

type Relation = '<=' | '>=' | '=='

function invRelation(op: Relation): Relation {
	if (op === '<=') return '>='
	if (op === '>=') return '<='
	return '=='
}

export const getTypeVars = createFoldFn(
	{
		TypeVar(ty) {
			return new Set([ty])
		},
	},
	new Set<TypeVar>(),
	union
)

// (ty: Value): Set<TypeVar> {
// 	switch (ty.type) {
// 		case 'TypeVar':
// 			return new Set([ty])
// 		case 'UnionType':
// 			return union(...ty.types.map(getTypeVars))
// 		case 'FnType': {
// 			const param = values(ty.param).map(getTypeVars)
// 			const out = getTypeVars(ty.out)
// 			return union(...param, out)
// 		}
// 		case 'Fn':
// 			return getTypeVars(ty.superType)
// 		case 'Vec': {
// 			const items = ty.items.map(getTypeVars)
// 			const rest: Set<TypeVar> = ty.rest ? getTypeVars(ty.rest) : new Set()
// 			return union(...items, rest)
// 		}
// 		case 'Dict': {
// 			const items = values(ty.items).map(getTypeVars)
// 			const rest: Set<TypeVar> = ty.rest ? getTypeVars(ty.rest) : new Set()
// 			return union(...items, rest)
// 		}
// 		default:
// 			return new Set()
// 	}
// }

export function shadowTypeVars(ty: Value) {
	const unifier = new Unifier()

	for (const tv of getTypeVars(ty)) {
		const shadowed = tv.shadow()
		unifier.mapTo(tv, shadowed)
	}

	return unifier.substitute(ty)
}

export class Unifier {
	#lowers = new Map<TypeVar, Value>()
	#uppers = new Map<TypeVar, Value>()
	#isEmpty = true

	constructor(...consts: Const[]) {
		this.#addConsts(...consts)
	}

	#getLower(tv: TypeVar) {
		return this.#lowers.get(tv) ?? never
	}

	#getUpper(tv: TypeVar) {
		return this.#uppers.get(tv) ?? all
	}

	#setLower(tv: TypeVar, l: Value) {
		this.#isEmpty = false
		const nl = unionType(l, this.#getLower(tv))
		this.#lowers.set(tv, nl)
		this.#normalizeRange(tv)
	}

	#setUpper(tv: TypeVar, u: Value) {
		this.#isEmpty = false
		const nu = intersectionType(u, this.#getUpper(tv))
		this.#uppers.set(tv, nu)
		this.#normalizeRange(tv)
	}

	#setEqual(tv: TypeVar, e: Value) {
		this.#isEmpty = false
		const nl = unionType(e, this.#getLower(tv))
		this.#lowers.set(tv, nl)

		const nu = intersectionType(e, this.#getUpper(tv))
		this.#uppers.set(tv, nu)

		this.#normalizeRange(tv)
	}

	/**
	 * α |-> [S, T] が S <: Tとならない場合に、無理矢理解決する
	 * @param tv
	 * @returns
	 */
	#normalizeRange(tv: TypeVar) {
		const l = this.#getLower(tv)
		const u = this.#getUpper(tv)

		if (l.isSubtypeOf(u)) return

		const ltvs = getTypeVars(l)
		const utvs = getTypeVars(u)
		if (ltvs.size === 0 && utvs.size === 0) {
			/**
			 * When both limits have no typeVars (e.g. α |-> [Num, Bool]),
			 * simply copy lower to upper
			 **/
			this.#uppers.set(tv, l)
			return
		}

		const subUnifier = new Unifier()
		if (utvs.size === 0 || l.type === 'TypeVar') {
			// α |-> [(has typeVars), (no typeVar)]
			// α |-> [<T>, ...]
			subUnifier.#addConsts([l, '==', u])
		} else if (ltvs.size === 0 || u.type === 'TypeVar') {
			// α |-> [(no typeVar), (has typeVar)]
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
		// Eliminate surplus typeVars from this subst
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

	mapTo(tv: TypeVar, l: Value) {
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
		if (t.type === 'FnType' && 'fnType' in u) {
			const tParam = vec(...values(t.param))
			const uParam = vec(...values(u.fnType.param))

			const tOut = t.out
			const uOut = u.fnType.out

			const cParam: Const = [tParam, Ri, uParam]
			const cOut: Const = [tOut, R, uOut]

			return this.#addConsts(cParam, cOut, ...cs)
		}

		/**
		 *  t1 R u1 /\ t2 R u2 /\ ...
		 * --------------------------- ST-Vec
		 *    [...ts] R [...us]
		 */
		// TODO: Generate optional/rest items
		if (t.type === 'Vec' && u.type === 'Vec') {
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

		// TODO: Support dict

		/**
		 *  t1 R (u - (t - t1)) /\
		 *  t2 R (u - (t - t2)) /\ ...
		 * --------------------------- ST-Union
		 *     t1 | t2... R u
		 */
		if (t.type === 'UnionType') {
			const cUnion: Const[] = t.types.map(ti => {
				const tRest = differenceType(t, ti)
				const ui = differenceType(u, tRest)
				return [ti, R, ui]
			})

			return this.#addConsts(...cUnion, ...cs)
		}

		// Finally set limits
		if (t.type === 'TypeVar') {
			if (getTypeVars(u).has(t)) throw new Error('Occur check')

			const Su = this.substitute(u)

			if (R === '<=') this.#setUpper(t, Su)
			if (R === '>=') this.#setLower(t, Su)
			if (R === '==') this.#setEqual(t, Su)

			return this.#addConsts(...cs)
		}

		if (u.type === 'TypeVar') {
			return this.#addConsts([u, Ri, t], ...cs)
		}

		return this.#addConsts(...cs)
	}

	substitute = (val: Value, unshadow = false): Value => {
		if (this.#isEmpty) return val
		if (val.type !== 'Fn' && !val.isType) return val

		switch (val.type) {
			case 'TypeVar': {
				const v = this.#lowers.get(val) ?? this.#uppers.get(val) ?? val
				return unshadow && v.type === 'TypeVar' ? v.unshadow() : v
			}
			case 'FnType': {
				const param = mapValues(val.param, p => this.substitute(p, unshadow))
				const out = this.substitute(val.out, unshadow)
				return fnTypeFrom(param, out)
			}
			case 'UnionType': {
				const types = val.types.map(ty => this.substitute(ty, unshadow))
				return unionType(...types)
			}
			case 'Fn':
				return fnFrom(
					this.substitute(val.superType, unshadow) as FnType,
					val.fn
				)
			case 'Vec': {
				const items = val.items.map(it => this.substitute(it, unshadow))
				const rest = val.rest ? this.substitute(val.rest, unshadow) : undefined
				return vecFrom(items, val.optionalPos, rest)
			}
			case 'Dict': {
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
