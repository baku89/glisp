export type Ast =
	| App
	| Scope
	| Sym
	| Function
	| number
	| string
	| null
	| boolean

export const Ast = Symbol('Ast')

export type App = {
	[Ast]: 'App'
	items: Ast[]
}

export function app(...items: Ast[]): App {
	return {[Ast]: 'App', items}
}

export type Scope = {
	[Ast]: 'Scope'
	vars: {[name: string]: Ast}
	ret?: Ast
}

export function scope(vars: {[name: string]: Ast}): Scope {
	return {[Ast]: 'Scope', vars}
}

export type Sym = {
	[Ast]: 'Sym'
	name: string
}

export function sym(name: TemplateStringsArray): Sym {
	return {[Ast]: 'Sym', name: name[0]}
}
