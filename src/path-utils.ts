import {vec2} from 'gl-matrix'
import {MalError, isKeyword, MalVal, keywordFor as K} from '@/mal/types'

const K_PATH = K('path')

export type Vec2 = number[] | vec2

export type PathType = (string | Vec2)[]
export type SegmentType = [string, ...Vec2[]]

export function* iterateSegment(path: PathType): Generator<SegmentType> {
	if (!Array.isArray(path)) {
		throw new MalError('Invalid path')
	}

	let start = path[0].toString().startsWith(K_PATH) ? 1 : 0

	for (let i = start + 1, l = path.length; i <= l; i++) {
		if (i === l || isKeyword(path[i] as MalVal)) {
			yield path.slice(start, i) as SegmentType
			start = i
		}
	}
}

export function getSVGPathData(path: PathType) {
	if (path[0].toString().startsWith(K_PATH)) {
		path = path.slice(1)
	}

	return path.map(x => (isKeyword(x as MalVal) ? x.slice(1) : x)).join(' ')
}
