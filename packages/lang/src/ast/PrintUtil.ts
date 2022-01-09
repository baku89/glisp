export function createListDelimiters(count: number): string[] {
	if (count === 0) {
		return ['']
	} else {
		return ['', ...Array(count - 1).fill(' '), '']
	}
}

export function insertDelimiters(elements: string[], delimiters: string[]) {
	if (
		elements.length + 1 !== delimiters.length &&
		elements.length !== delimiters.length
	) {
		throw new Error('Invalid length of delimiters')
	}

	let str = delimiters[0]

	for (let i = 0; i < elements.length; i++) {
		str += elements[i] + (delimiters[i + 1] ?? '')
	}

	return str
}
