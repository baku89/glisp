/**
 * What a key means to a number that has only just been offered to type over. A number or
 * an expression begins with what a shortcut does not, so one can follow a drawing at once.
 */

export interface KeyPressed {
	readonly key: string
	readonly metaKey: boolean
	readonly ctrlKey: boolean
	readonly altKey: boolean
	readonly shiftKey: boolean
}

export interface InputState {
	readonly value: string
	readonly selectionStart: number | null
	readonly selectionEnd: number | null
}

/** What an expression can begin with: what it is given. `Math` has a capital, and so a Shift. */
const BEGINS_EXPRESSION = new Set(['x', 'i'])

/** Whether a key is not being typed, but is for whatever it means elsewhere. */
export function isForElsewhere(
	{ key, metaKey, ctrlKey, altKey, shiftKey }: KeyPressed,
	{ value, selectionStart, selectionEnd }: InputState
): boolean {
	if (metaKey || ctrlKey || altKey || shiftKey) return false
	if (!/^[a-z]$/.test(key) || BEGINS_EXPRESSION.has(key)) return false
	// Anything else about the selection is someone in the middle of typing.
	return value !== '' && selectionStart === 0 && selectionEnd === value.length
}
