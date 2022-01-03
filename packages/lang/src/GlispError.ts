import type {Node} from './ast'

export class GlispError extends Error {
	constructor(public readonly ref: Node, message?: string | undefined) {
		super(message)
	}
}
