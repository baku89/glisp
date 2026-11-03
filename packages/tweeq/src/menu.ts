import type { AST } from '@glisp/lang'
import type { MenuItem } from 'tweeq/Menu'

import { actionsOf, type Slot, type SlotAction } from './structure'

/** A slot's actions as a menu, in groups. `apply` gets the new parent. */
export function slotMenuItems(
	slot: Slot,
	apply: (parent: AST) => void
): MenuItem[] {
	const items: MenuItem[] = []
	let group: SlotAction['group'] | null = null
	for (const action of actionsOf(slot)) {
		if (group !== null && group !== action.group) items.push({ separator: true })
		group = action.group
		items.push({
			label: action.label,
			icon: action.icon,
			...(action.keys === undefined ? {} : { bindIcon: [...action.keys] }),
			perform: () => {
				if ('apply' in action) apply(action.apply())
				else void navigator.clipboard.writeText(action.copy())
			},
		})
	}
	return items
}
