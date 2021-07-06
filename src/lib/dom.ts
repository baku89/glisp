export function isDecendantElementOf(child: HTMLElement, parent: HTMLElement) {
	let node: HTMLElement | null = child
	while (node) {
		if (node === parent) return true
		node = node.parentElement
	}

	return false
}
