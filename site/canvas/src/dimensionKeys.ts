/**
 * What a key means to a number that has only just been offered to type over, as it is once
 * a shape has been drawn. A number begins with what a shortcut does not, so one can follow a
 * drawing at once, and so does an expression, as `(`, or `=` for one that begins with a name.
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

/** Whether a key is not being typed, but is for whatever it means elsewhere. */
export function isForElsewhere(
	{ key, metaKey, ctrlKey, altKey, shiftKey }: KeyPressed,
	{ value, selectionStart, selectionEnd }: InputState
): boolean {
	if (metaKey || ctrlKey || altKey || shiftKey) return false
	if (!/^[a-z]$/.test(key)) return false
	// Anything else about the selection is someone in the middle of typing.
	return value !== '' && selectionStart === 0 && selectionEnd === value.length
}
