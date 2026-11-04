/**
 * A number field is edited as it is typed in, so each key is a change to the program. What
 * is one edit is from when it gets the focus until it is let go of, or Enter is pressed.
 */

import { useEventListener } from '@vueuse/core'

import type { GlispDocument } from './document'

const fieldOf = (target: EventTarget | null): HTMLInputElement | null =>
	target instanceof Element ? target.closest<HTMLInputElement>('.TqInputNumber input') : null

export function useNumberFieldEdits(document: GlispDocument): void {
	useEventListener(window, 'focusin', event => {
		if (fieldOf(event.target)) document.hold()
	})
	useEventListener(window, 'focusout', event => {
		if (fieldOf(event.target)) document.release()
	})
	useEventListener(
		window,
		'keydown',
		(event: KeyboardEvent) => {
			const field = fieldOf(event.target)
			if (field === null || event.isComposing) return
			if (event.key === 'Enter') {
				// After what the field does with it, and it goes on having the focus.
				queueMicrotask(() => {
					document.release()
					if (globalThis.document.activeElement === field) document.hold()
				})
				return
			}
			if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return
			// It would otherwise take back the text, which would be one more edit. It lets go
			// first, as what a field with the focus says is what was typed in it.
			event.preventDefault()
			event.stopPropagation()
			field.blur()
			if (event.shiftKey) document.redo()
			else document.undo()
		},
		{ capture: true }
	)
}
