import {MaybeElementRef, unrefElement} from '@vueuse/core'
import {ref, watch} from 'vue'

export function useEm(el: MaybeElementRef) {
	const em = ref(0)

	watch(
		() => el,
		() => {
			const dom = unrefElement(el)

			if (el instanceof HTMLElement) {
				em.value = parseFloat(getComputedStyle(dom).fontSize)
			}
		}
	)

	return {em}
}
