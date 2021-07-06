export function isDecendantElementOf(child: Element, parent: Element) {
	let node: Element | null = child
	while (node) {
		if (node === parent) return true
		node = node.parentElement
	}

	return false
}
