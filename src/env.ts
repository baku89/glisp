import {Ast} from './ast'

export type Env = {
	parent?: Env
	ast: Ast
}