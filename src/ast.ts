export type Ast =
	| Sym
	| List
	| Scope
	| ((...args: any[]) => Ast)
	| number
	| string
	| null
	| boolean
	| Prim
	| typeof Unit
	| Ast[]

export const Type = Symbol('Type')

export class Prim {
	readonly [Type] = 'Prim'

	constructor(readonly value: number | string | boolean) {}

	toPrimitive(): number | string | boolean {
		return this.value
	}
}

export type List = {
	readonly [Type]: 'List'
	readonly items: Ast[]
}

export function list(...items: Ast[]): List {
	return {[Type]: 'List', items}
}

export type Scope = {
	readonly [Type]: 'Scope'
	readonly vars: {[name: string]: Ast}
	readonly ret?: Ast
}

export function scope(vars: {[name: string]: Ast}): Scope {
	return {[Type]: 'Scope', vars}
}

export function isScope(ast: Ast): ast is Scope {
	return (
		typeof ast === 'object' &&
		ast !== null &&
		!Array.isArray(ast) &&
		ast[Type] === 'Scope'
	)
}

export type Sym = {
	readonly [Type]: 'Sym'
	readonly name: string
}

export function sym(name: TemplateStringsArray): Sym {
	return {[Type]: 'Sym', name: name[0]}
}

export const Unit = Symbol('Unit')
