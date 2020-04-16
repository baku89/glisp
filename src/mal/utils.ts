export function partition(n: number, coll: any[]) {
	const ret = []

	for (let i = 0; i < coll.length; i += n) {
		ret.push(coll.slice(i, i + n))
	}
	return ret
}
