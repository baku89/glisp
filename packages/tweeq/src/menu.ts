import type { AST } from '@glisp/lang'
import type { MenuItem } from 'tweeq/Menu'

import { actionsOf, type Slot, type SlotAction } from './structure'

/** How a value's field goes into editing: `editValue` if it has a number to edit. */
export function editMenuItems(
	editValue: (() => void) | null,
	editExpression: () => void
): MenuItem[] {
	return [
		...(editValue === null
			? []
			: [
					{
						label: 'Edit Value',
						icon: 'mdi:pound',
						bindIcon: ['V'],
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

/** A slot's actions as a menu, in groups. `apply` gets the new parent. */
export function slotMenuItems(
	slot: Slot,
	apply: (parent: AST, action: SlotAction) => void
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
				if ('apply' in action) apply(action.apply(), action)
				else void navigator.clipboard.writeText(action.copy())
			},
		})
	}
	return items
}
