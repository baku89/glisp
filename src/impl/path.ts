import { vec2 } from 'gl-matrix'
import Bezier from 'bezier-js'

const _SYM = Symbol.for

const SYM_PATH = _SYM('path')
const SYM_M = _SYM('M')
const SYM_L = _SYM('L')
const SYM_C = _SYM('C')
const SYM_Z = _SYM('Z')

function* splitCommands(path: (number | symbol)[]): Generator<[symbol, ...number[]]> {
	let start = 0

	for (let i = 1, l = path.length; i <= l; i++) {
		if (i === l || typeof path[i] === 'symbol') {
			yield path.slice(start, i) as [symbol, ...number[]]
			start = i
		}
	}
}

function pathToBezier(path: (number | symbol)[]) {
	if (!Array.isArray(path) || path[0] !== SYM_PATH) {
		throw new Error('path-to-bezier: invalid path')
	} else {
		const ret: (number | symbol)[] = [SYM_PATH]
		const commands = path.slice(1)

		for (const line of splitCommands(commands)) {

			const [cmd, ...args] = line

			let sx = 0, sy = 0

			switch (cmd) {
				case SYM_M:
				case SYM_C:
					[sx, sy] = args
					ret.push(...line)
					break
				case SYM_Z:
					ret.push(...line)
					break
				case SYM_L:
					ret.push(SYM_L, sx, sy, ...args, ...args)
					break
				default:
					throw new Error(
						`Invalid d-path command2: ${
						typeof cmd === 'symbol' ? Symbol.keyFor(cmd) : cmd
						}`
					)
			}
		}
		return ret
	}
}

function offsetBezier(...args: number[]) {

	const bezier = new Bezier([
		{ x: args[0], y: args[1] },
		{ x: args[2], y: args[3] },
		{ x: args[4], y: args[5] },
		{ x: args[6], y: args[7] }
	])

	const d = args[8]

	const offset = bezier.offset(d)

	const { x, y } = offset[0].points[0]

	const ret = [SYM_M, x, y]

	for (const seg of offset) {
		const pts = seg.points
		ret.push(SYM_C)
		for (let i = 1; i < 4; i++) {
			ret.push(pts[i].x, pts[i].y)
		}
	}

	return ret
}

function offsetLine(a: vec2, b: vec2, d: number) {
	if (vec2.equals(a, b)) {
		return false
	}

	const dir = vec2.create()

	vec2.sub(dir, b, a)
	vec2.rotate(dir, dir, [0, 0], Math.PI / 2)
	vec2.normalize(dir, dir)
	vec2.scale(dir, dir, d)

	const oa = vec2.create()
	const ob = vec2.create()

	vec2.add(oa, a, dir)
	vec2.add(ob, b, dir)

	return [SYM_M, ...oa, SYM_L, ...ob] as (symbol | number)[]
}

function offsetPath(d: number, path: (number | symbol)[]) {
	if (!Array.isArray(path) || path[0] !== SYM_PATH) {
		throw new Error('Invalid Path')
	} else {

		const ret: (symbol | number)[] = [SYM_PATH]
		const commands = path.slice(1)

		const last = vec2.create() // original last
		const first = vec2.create() // original first
		const loff = vec2.create()  // last offset

		let continued = false

		let cmd, args
		for ([cmd, ...args] of splitCommands(commands)) {

			if (cmd === SYM_M) {
				vec2.copy(first, args as vec2)
				vec2.copy(last, first)
			} else if (cmd === SYM_L || cmd === SYM_C || cmd === SYM_Z) {
				if (cmd === SYM_Z) {
					args = first as number[]
				}

				let off = cmd === SYM_C ? offsetBezier(...last, ...args, d) : offsetLine(last, args as vec2, d)
				if (off) {
					if (continued) {
						off[0] = SYM_L
						if (vec2.equals(loff, off.slice(1) as vec2)) {
							off = off.slice(3)
						}
					}
					ret.push(...off)
					vec2.copy(last, args.slice(-2) as vec2)
					vec2.copy(loff, off.slice(-2) as vec2)
					continued = true
				}
			}

			if (cmd === SYM_Z) {
				ret.push(SYM_Z)
				continued = false
			}
		}
		return ret
	}
}

export const pathNS = new Map<string, any>([
	['path-to-bezier', pathToBezier],
	['path-offset', offsetPath]
])
