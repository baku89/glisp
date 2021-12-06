import {mapValues, values} from 'lodash'

import {
	all,
	bottom,
	dict,
	fnFrom,
	tyDict,
	TyFn,
	tyFnFrom,
	TyUnion,
	TyVar,
	tyVec,
	Value,
	vec,
} from '.'
import {UnitableType} from './exp'
import {intersectTy, uniteTy} from './type-operators'

type SubstMap = Map<TyVar, Value>

export type Const = [Value, Relation, Value]
type Relation = '<=' | '>='

const invRelation = (op: Relation): Relation => (op === '<=' ? '>=' : '<=')
const fillerForRelation = (op: Relation) => (op === '<=' ? all : bottom)

export function getTyVars(ty: Value): Set<TyVar> {
	switch (ty.type) {
		case 'tyVar':
			return new Set([ty])
		case 'tyUnion': {
			const tvs = ty.types.map(ty => [...getTyVars(ty)]).flat()
			return new Set(tvs)
		}
		case 'tyFn': {
			const param = values(ty.param)
				.map(p => [...getTyVars(p)])
				.flat()
			const out = getTyVars(ty.out)
			return new Set([...param, ...out])
		}
		case 'fn': {
			return getTyVars(ty.superType)
		}
		case 'vec': {
			const items = ty.items.map(i => [...getTyVars(i)]).flat()
			return new Set(items)
		}
		case 'tyVec': {
			const items = ty.items.map(i => [...getTyVars(i)]).flat()
			const rest = ty.rest ? [...getTyVars(ty.rest)] : []
			return new Set([...items, ...rest])
		}
		case 'dict': {
			const items = values(ty.items)
				.map(p => [...getTyVars(p)])
				.flat()
			return new Set(items)
		}
		case 'tyDict': {
			const items = values(ty.items)
				.map(p => [...getTyVars(p.value)])
				.flat()
			const rest = ty.rest ? [...getTyVars(ty.rest)] : []
			return new Set([...items, ...rest])
		}
		default:
			return new Set()
	}
}

export function shadowTyVars(ty: Value) {
	const subst = RangedUnifier.empty()

	for (const tv of getTyVars(ty)) {
		const tv2 = tv.shadow()
		subst.addConsts([
			[tv, '<=', tv2],
			[tv, '>=', tv2],
		])
	}

	return subst.substitute(ty)
}

export function unshadowTyVars(ty: Value): Value {
	switch (ty.type) {
		case 'tyVar':
			return ty.unshadow()
		case 'tyUnion':
			return TyUnion.fromTypesUnsafe(
				ty.types.map(unshadowTyVars) as UnitableType[]
			)
		case 'tyFn': {
			const param = mapValues(ty.param, unshadowTyVars)
			const out = unshadowTyVars(ty.out)
			return tyFnFrom(param, out)
		}
		case 'fn': {
			const tyFn = unshadowTyVars(ty.superType) as TyFn
			return fnFrom(tyFn, ty.fn)
		}
		case 'vec': {
			const items = ty.items.map(unshadowTyVars)
			return vec(...items)
		}
		case 'tyVec': {
			const items = ty.items.map(unshadowTyVars)
			const rest = unshadowTyVars(ty.rest)
			return tyVec(items, rest)
		}
		case 'dict': {
			const items = mapValues(ty.items, unshadowTyVars)
			return dict(items)
		}
		case 'tyDict': {
			const items = mapValues(ty.items, ({optional, value}) => ({
				optional,
				value: unshadowTyVars(value),
			}))
			const rest = ty.rest ? unshadowTyVars(ty.rest) : undefined
			return tyDict(items, rest)
		}
		default:
			return ty
	}
}

export class RangedUnifier {
	private lowers: SubstMap = new Map()
	private uppers: SubstMap = new Map()
	private constructor() {
		return
	}

	private getLower(tv: TyVar) {
		return this.lowers.get(tv) ?? bottom
	}

	private getUpper(tv: TyVar) {
		return this.uppers.get(tv) ?? all
	}

	private setLower(tv: TyVar, l: Value) {
		const nl = uniteTy(l, this.getLower(tv))
		this.lowers.set(tv, nl)
		this.normalizeRange(tv)
	}

	private setUpper(tv: TyVar, u: Value) {
		const nu = intersectTy(u, this.getUpper(tv))
		this.uppers.set(tv, nu)
		this.normalizeRange(tv)
	}

	private normalizeRange(tv: TyVar) {
		const l = this.getLower(tv)
		const u = this.getUpper(tv)

		if (l.isSubtypeOf(u)) return

		const subst = RangedUnifier.empty()

		const ltvs = getTyVars(l)
		const utvs = getTyVars(u)
		if (ltvs.size === 0 && utvs.size === 0) {
			/**
			 * When both limits have no tyVars (e.g. α |-> [Num, Bool]),
			 * simply copy lower to upper
			 **/
			this.uppers.set(tv, l)
			return
		}

		/**
		 * TODO: 等式制約をつかった単一化アルゴリズムを使う
		 * X |-> [A -> B, C -> (D -> E)] のように、下限、上限の両方に型変数を含み、
		 * かつどちらも複合的な型の場合、以下の条件式だと else節の C={u >= l /\ u <= l}
		 * で単一化を試みようとする。
		 * SubstRangedの単一化アルゴリズムは、不等式の左辺に登場する型変数の代入を求め、
		 * かつ不正な制約の場合も、α |-> [bot, top] にフォールバックする仕組みのため、
		 * 本来欲しかった σ = [A |-> C, B |-> (D -> E)] ではなく、
		 * σ = [C |-> A, D |-> [bot, top], E |-> [bot, top]] を返してしまう。
		 * オーソドックスな単一化アルゴリズムで解きつつ、
		 * かつ不正な制約の場合の場合分けについて考えなくてはいけない。
		 **/
		if (utvs.size === 0 || l.type === 'tyVar') {
			subst.addConsts([
				[l, '>=', u],
				[l, '<=', u],
			])
		} else if (ltvs.size === 0 || u.type === 'tyVar') {
			subst.addConsts([
				[u, '>=', l],
				[u, '<=', l],
			])
		} else {
			subst.addConsts([
				[u, '>=', l],
				[u, '<=', l],
			])
		}

		for (const [tv, l] of this.lowers) {
			this.lowers.set(tv, subst.substitute(l))
		}
		for (const [tv, u] of this.uppers) {
			this.uppers.set(tv, subst.substitute(u))
		}

		this.mergeWith(subst)
	}

	private mergeWith(subst: RangedUnifier) {
		for (const [tv, l] of subst.lowers) {
			if (this.lowers.has(tv)) throw new Error('Cannot merge substs')
			this.lowers.set(tv, l)
		}
		for (const [tv, u] of subst.uppers) {
			if (this.uppers.has(tv)) throw new Error('Cannot merge substs')
			this.uppers.set(tv, u)
		}
	}

	public addConsts(consts: Const[]): RangedUnifier {
		if (consts.length === 0) return this

		const [[t, R, u], ...cs] = consts

		const Ri = invRelation(R)
		const f = fillerForRelation(R)
		const fi = fillerForRelation(Ri)

		// Match constraints spawing sub-constraints

		// tp R' up /\ to R tp
		//--------------------- ST-TyFn
		// tp -> to R up -> uo
		if (t.type === 'tyFn') {
			const tParam = vec(...values(t.param))
			const tOut = t.out

			let uParam: Value, uOut: Value
			if ('tyFn' in u) {
				uParam = vec(...values(u.tyFn.param))
				uOut = u.tyFn.out
			} else {
				uParam = fi
				uOut = f
			}

			const cParam: Const = [tParam, Ri, uParam]
			const cOut: Const = [tOut, R, uOut]

			this.addConsts([cParam, cOut])
		}

		// t1 R u1 /\ t2 R u2 /\ ...
		// --------------------------- ST-Vec
		// [...ts] R [...us]
		if (t.type === 'vec' || t.type === 'tyVec') {
			let uItems: Value[], uRest: Value | null

			if (u.type === 'vec' || u.type === 'tyVec') {
				uItems = u.items
				uRest = 'rest' in u ? u.rest : null
			} else {
				uItems = []
				uRest = null
			}

			const cItems = t.items.map((ti, i) => [ti, R, uItems[i] ?? f] as Const)
			let cRest: Const[] = []
			if ('rest' in t) {
				cRest = uItems.slice(t.items.length).map(ui => [t.rest, R, ui] as Const)
				if (uRest) {
					cRest.push([t.rest, R, uRest])
				}
			}

			this.addConsts([...cItems, ...cRest])
		}

		// ST-Union
		if (t.type === 'tyUnion') {
			const uTypes: Value[] = u.type === 'tyUnion' ? u.types : [u]

			const cUnion: Const[] = t.types.map(ti => {
				const tOthers = t.types.filter(t => ti !== t)

				const uSubtractedTypes = uTypes.filter(
					ut => !tOthers.some(ut.isSubtypeOf)
				)

				const ui = uniteTy(...uSubtractedTypes)

				return [ti, R, ui]
			})

			this.addConsts([...cUnion])
		}

		if (t.type === 'tyVar') {
			if (getTyVars(u).has(t)) throw new Error('Occur check')

			const Su = this.substitute(u)

			if (R === '<=') {
				this.setUpper(t, Su)
			} else {
				this.setLower(t, Su)
			}
		}

		return this.addConsts(cs)
	}

	public substitute(val: Value, covariant = true): Value {
		const limits = covariant ? this.lowers : this.uppers
		switch (val.type) {
			case 'tyVar': {
				return limits.get(val) ?? val
			}
			case 'tyFn': {
				const param = mapValues(val.param, p => this.substitute(p, !covariant))
				const out = this.substitute(val.out)
				return tyFnFrom(param, out)
			}
			case 'tyUnion': {
				const types = val.types.map(ty => this.substitute(ty, covariant))
				return uniteTy(...types)
			}
			case 'fn':
				return fnFrom(this.substitute(val.superType, covariant) as TyFn, val.fn)
			case 'vec': {
				const items = val.items.map(it => this.substitute(it, covariant))
				return vec(...items)
			}
			case 'tyVec': {
				const items = val.items.map(it => this.substitute(it, covariant))
				const rest = this.substitute(val.rest)
				return tyVec(items, rest)
			}
			case 'dict': {
				const items = mapValues(val.items, it => this.substitute(it, covariant))
				return dict(items)
			}
			case 'tyDict': {
				const items = mapValues(val.items, ({optional, value}) => ({
					optional,
					value: this.substitute(value, covariant),
				}))
				const rest = val.rest ? this.substitute(val.rest) : undefined
				return tyDict(items, rest)
			}
			default:
				return val
		}
	}

	public print() {
		const tvs = [...new Set([...this.lowers.keys(), ...this.uppers.keys()])]
		const strs = tvs.map(tv => {
			const x = tv.print()
			const l = this.getLower(tv).print()
			const u = this.getUpper(tv).print()
			return `${x} |-> [${l}, ${u}]`
		})

		return '[' + strs.join(', ') + ']'
	}

	public static empty() {
		return new RangedUnifier()
	}

	public static unify(consts: Const[]) {
		return new RangedUnifier().addConsts(consts)
	}
}
