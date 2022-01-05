import {mapValues, values} from 'lodash'

import {union} from '../util/SetOperation'
import {zip} from '../util/zip'
import {
	all,
	dict,
	differenceType,
	fnFrom,
	FnType,
	fnType,
	intersectionType,
	isEqual,
	never,
	TypeVar,
	unionType,
	Value,
	vec,
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
		TypeVar: ty => new Set([ty]),
	},
	new Set<TypeVar>(),
	union
)

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
			const tf = t
			const uf = u.fnType

			const tParam = vec(values(tf.param), tf.optionalPos, tf.rest?.value)
			const uParam = vec(values(uf.param), uf.optionalPos, uf.rest?.value)

			const tOut = tf.out
			const uOut = uf.out

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

	substitute = (value: Value, unshadow = false): Value => {
		if (this.#isEmpty) return value
		if (value.type !== 'Fn' && !value.isType) return value

		switch (value.type) {
			case 'TypeVar': {
				const v = this.#lowers.get(value) ?? this.#uppers.get(value) ?? value
				return unshadow && v.type === 'TypeVar' ? v.unshadow() : v
			}
			case 'FnType': {
				const param = mapValues(value.param, p => this.substitute(p, unshadow))
				const rest = value.rest
					? {...value.rest, value: this.substitute(value.rest.value, unshadow)}
					: undefined
				const out = this.substitute(value.out, unshadow)
				return fnType({param, rest, out})
			}
			case 'UnionType': {
				const types = value.types.map(ty => this.substitute(ty, unshadow))
				return unionType(...types)
			}
			case 'Fn':
				return fnFrom(
					this.substitute(value.superType, unshadow) as FnType,
					value.fn
				)
			case 'Vec': {
				const items = value.items.map(it => this.substitute(it, unshadow))
				const rest = value.rest
					? this.substitute(value.rest, unshadow)
					: undefined
				return vec(items, value.optionalPos, rest)
			}
			case 'Dict': {
				const items = mapValues(value.items, it =>
					this.substitute(it, unshadow)
				)
				const rest = value.rest
					? this.substitute(value.rest, unshadow)
					: undefined
				return dict(items, value.optionalKeys, rest)
			}
			default:
				return value
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
