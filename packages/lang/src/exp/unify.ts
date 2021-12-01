import {mapValues, values} from 'lodash'

import * as Val from '../val'

type SubstMap = Map<Val.TyVar, Val.Value>

export type Const = [Val.Value, Relation, Val.Value]
type Relation = '<=' | '>='

const invRelation = (op: Relation): Relation => (op === '<=' ? '>=' : '<=')
const fillerForRelation = (op: Relation) => (op === '<=' ? Val.all : Val.bottom)

export function getTyVars(ty: Val.Value): Set<Val.TyVar> {
	switch (ty.type) {
		case 'tyVar':
			return new Set([ty])
		case 'tyUnion': {
			const tvs = ty.types.map(ty => [...getTyVars(ty)]).flat()
			return new Set(tvs)
		}
		case 'tyFn': {
			const param = ty.tyParam.map(p => [...getTyVars(p)]).flat()
			const out = getTyVars(ty.tyOut)
			return new Set([...param, ...out])
		}
		case 'fn': {
			const param = values(ty.param)
				.map(p => [...getTyVars(p)])
				.flat()
			const out = getTyVars(ty.out)
			return new Set([...param, ...out])
		}

		case 'vec': {
			const items = ty.items.map(i => [...getTyVars(i)]).flat()
			const rest = ty.rest ? [...getTyVars(ty.rest)] : []
			return new Set([...items, ...rest])
		}
		default:
			return new Set()
	}
}

export function shadowTyVars(ty: Val.Value) {
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
export function unshadowTyVars(ty: Val.Value): Val.Value {
	switch (ty.type) {
		case 'tyVar':
			return ty.unshadow()
		case 'tyUnion':
			return Val.TyUnion.fromTypesUnsafe(ty.types.map(unshadowTyVars))
		case 'tyFn': {
			const param = ty.tyParam.map(unshadowTyVars)
			const out = unshadowTyVars(ty.tyOut)
			return Val.tyFn(param, out)
		}
		case 'fn': {
			const param = mapValues(ty.param, unshadowTyVars)
			const out = unshadowTyVars(ty.out)
			return Val.fn(ty.fn, param, out)
		}
		case 'vec': {
			const items = ty.items.map(unshadowTyVars)
			const rest = ty.rest ? unshadowTyVars(ty.rest) : null
			return Val.vecFrom(items, rest)
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

	private getLower(tv: Val.TyVar) {
		return this.lowers.get(tv) ?? Val.bottom
	}

	private getUpper(tv: Val.TyVar) {
		return this.uppers.get(tv) ?? Val.all
	}

	private setLower(tv: Val.TyVar, l: Val.Value) {
		const nl = Val.uniteTy(l, this.getLower(tv))
		this.lowers.set(tv, nl)
		this.normalizeRange(tv)
	}

	private setUpper(tv: Val.TyVar, u: Val.Value) {
		const nu = Val.intersectTy(u, this.getUpper(tv))
		this.uppers.set(tv, nu)
		this.normalizeRange(tv)
	}

	private normalizeRange(tv: Val.TyVar) {
		const l = this.getLower(tv)
		const u = this.getUpper(tv)

		if (l.isSubtypeOf(u)) return

		const subst = RangedUnifier.empty()

		const ltvs = getTyVars(l)
		const utvs = getTyVars(u)
		if (ltvs.size === 0 && utvs.size === 0) {
			/**
			 * When both limits have no tyVars (e.g. α |-> [Int, Bool]),
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
		// tp -> to R up -> uo
		//--------------------- TyFn
		// tp R' up /\ to R tp
		if (t.type === 'tyFn') {
			const tParam = Val.vecFrom(t.tyFn.tyParam)
			const tOut = t.tyFn.tyOut

			let uParam: Val.Value, uOut: Val.Value
			if ('tyFn' in u) {
				uParam = Val.vecFrom(u.tyFn.tyParam)
				uOut = u.tyFn.tyOut
			} else {
				uParam = fi
				uOut = f
			}

			const cParam: Const = [tParam, Ri, uParam]
			const cOut: Const = [tOut, R, uOut]

			this.addConsts([cParam, cOut])
		}

		// [...ts] R [...us]
		// --------------------------- Vec
		// t1 R u1 /\ t2 R u2 /\ ...
		if (t.type === 'vec') {
			let uItems: Val.Value[], uRest: Val.Value | null
			if (u.type === 'vec') {
				uItems = u.items
				uRest = u.rest
			} else {
				uItems = []
				uRest = null
			}

			const cItems = t.items.map((ti, i) => [ti, R, uItems[i] ?? f] as Const)
			let cRest: Const[] = []
			if (t.rest) {
				cRest = uItems.slice(t.length).map(ui => [t.rest, R, ui] as Const)
				if (uRest) {
					cRest.push([t.rest, R, uRest])
				}
			}

			this.addConsts([...cItems, ...cRest])
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

	public substitute(val: Val.Value, covariant = true): Val.Value {
		const limits = covariant ? this.lowers : this.uppers
		switch (val.type) {
			case 'tyVar': {
				return limits.get(val) ?? val
			}
			case 'tyFn': {
				const param = val.tyParam.map(p => this.substitute(p, !covariant))
				const out = this.substitute(val.tyOut)
				return Val.tyFn(param, out)
			}
			case 'fn': {
				const param = mapValues(val.param, p => this.substitute(p, !covariant))
				const out = this.substitute(val.out)
				return Val.fn(val.fn, param, out)
			}
			case 'vec': {
				const items = val.items.map(it => this.substitute(it, covariant))
				const rest = val.rest ? this.substitute(val.rest) : null
				return Val.vecFrom(items, rest)
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
