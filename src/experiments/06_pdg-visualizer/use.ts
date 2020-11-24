import {inject, Ref, ref, UnwrapRef, watch} from 'vue'

import {evalPDG, PDG, printValue} from './glisp'

export function useAsyncComputed<T, K>(
	initial: T,
	objectToWatch: Ref<K>,
	getter: (obj: K, prevObj: K | undefined) => Promise<T>
) {
	const value = ref<T>(initial)

	const isUpdating = ref(false)

	let next: null | K = null

	watch(() => objectToWatch.value, update, {immediate: true})

	async function update(obj: K, oldObj: K | undefined) {
		if (isUpdating.value) {
			next = objectToWatch.value
			return
		}

		next = null
		isUpdating.value = true
		try {
			value.value = (await getter(obj, oldObj)) as UnwrapRef<T>
		} catch (err) {
			console.error(err)
		}
		isUpdating.value = false

		if (next) {
			setTimeout(update, 0)
		}
	}

	return {value, isUpdating}
}

export function useSwapPDG() {
	return inject<(oldValue: PDG, newValue: PDG) => any>('swap-pdg', () => {
		throw new Error('swapPDG is not provided')
	})
}

export function usePDGEvalauted(pdg: Ref<PDG>) {
	const {value: evaluated} = useAsyncComputed<null | string, PDG>(
		null,
		pdg,
		async () => {
			try {
				return printValue(await evalPDG(pdg.value))
			} catch (err) {
				return null
			}
		}
	)

	return {evaluated}
}
