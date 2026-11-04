import type { AST } from '@glisp/lang'
import type { MenuItem } from 'tweeq/Menu'

import type { Linker } from './selection'
import { actionsOf, parseSource, type Slot, type SlotAction } from './structure'

/** How a value's field goes into editing: `editValue` if it has a number to edit. */
export function editMenuItems(
	editValue: (() => void) | null,
	editExpression: () => void,
	/** Keys the app has for something else, which then do not do this. */
	hostKey?: (event: KeyboardEvent) => boolean
): MenuItem[] {
	const valueKey = hostKey?.(new KeyboardEvent('keydown', { key: 'v' })) ? {} : { bindIcon: ['V'] }
	return [
		...(editValue === null
			? []
			: [
					{
						label: 'Edit Value',
						icon: 'mdi:pound',
						...valueKey,
						perform: editValue,
					},
				]),
		{
			label: 'Edit Expression',
			icon: 'mdi:code-parentheses',
			bindIcon: ['='],
			perform: editExpression,
		},
		{ separator: true },
	]
}

/**
 * A slot's actions as a menu, in groups. `apply` gets the new parent. With `commands`, which
 * is what the app around has for it, those stand in for what `SLOT_COMMANDS` would offer.
 */
export function slotMenuItems(
	slot: Slot,
	apply: (parent: AST, action: SlotAction) => void,
	commands?: readonly MenuItem[]
): MenuItem[] {
	const items: MenuItem[] = []
	let group: SlotAction['group'] | null = null
	const own = actionsOf(slot).filter(({ id }) => commands === undefined || id === undefined)
	for (const action of own) {
		if (group !== null && group !== action.group) items.push({ separator: true })
		group = action.group
		items.push({
			label: action.label,
			icon: action.icon,
			...(action.keys === undefined ? {} : { bindIcon: [...action.keys] }),
			perform: () => {
				if ('apply' in action) apply(action.apply(), action)
				else void navigator.clipboard.writeText(action.copy())
			},
		})
	}
	if (commands === undefined || commands.length === 0) return items
	return [...items, ...(items.length > 0 ? [{ separator: true as const }] : []), ...commands]
}

/**
 * Pasting here, and copying a reference to here. A reference is on the clipboard like
 * anything else, and pastes as one because of what it is, and not by being asked to.
 */
export function referenceMenuItems(
	linker: Linker,
	path: string,
	paste: (code: AST) => void
): MenuItem[] {
	const pasteFromClipboard = async (): Promise<void> => {
		const text = await navigator.clipboard.readText()
		const copied = linker.pasted(text)
		if (copied !== null) return linker.link(path, copied)
		if (linker.pasteInto(path, text)) return
		const code = parseSource(text)
		if (code !== null) paste(code)
	}
	return [
		{
			label: 'Paste',
			icon: 'mdi:clipboard-text-outline',
			bindIcon: ['⌘', 'V'],
			perform: () => void pasteFromClipboard(),
		},
		...(linker.canCopy(path)
			? [
					{
						label: 'Copy Reference',
						icon: 'mdi:link-variant',
						bindIcon: ['⌘', '⌥', 'C'],
						perform: () => void linker.copy(path),
					},
				]
			: []),
		...(linker.canExtract(path)
			? [
					{
						label: 'Extract Parameter',
						icon: 'mdi:variable',
						perform: () => linker.extract(path),
					},
				]
			: []),
	]
}

/** What can be done with an argument that is not given yet: only to give it one. */
export function missingMenuItems(linker: Linker, at: string, parameter: string): MenuItem[] {
	return [
		{
			label: 'Paste',
			icon: 'mdi:clipboard-text-outline',
			bindIcon: ['⌘', 'V'],
			perform: () =>
				void navigator.clipboard
					.readText()
					.then(text => linker.pasteMissing(at, parameter, text)),
		},
	]
}

/** `items`, with `more` among the copies, ahead of what deletes it, if anything does. */
export function withCopyItems(items: readonly MenuItem[], more: readonly MenuItem[]): MenuItem[] {
	const end = items.findIndex(item => 'label' in item && item.label === 'Delete')
	const at = end < 0 ? items.length : Math.max(0, end - 1)
	return [...items.slice(0, at), ...more, ...items.slice(at)]
}
