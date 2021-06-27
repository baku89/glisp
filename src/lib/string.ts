export function generateUniqueKey(
	key: string,
	existingKeys: string[],
	separator = ''
) {
	if (!existingKeys.includes(key)) {
		return key
	}

	const match = /^(.+?)([0-9]+)$/.exec(key)

	let prefix = key + separator,
		index = 2,
		numbered: string

	if (match !== null) {
		prefix = match[1]
		index = Math.max(2, parseInt(match[2]))
	}

	do {
		numbered = prefix + index++
	} while (existingKeys.includes(numbered))

	return numbered
}
