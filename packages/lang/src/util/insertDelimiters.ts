export function insertDelimiters(elements: string[], delimiters: string[]) {
	if (elements.length !== delimiters.length) {
		throw new Error('Invalid length of delimiters')
	}

	let str = ''

	for (let i = 0; i < elements.length; i++) {
		str += elements[i] + delimiters[i]
	}

	return str
}
