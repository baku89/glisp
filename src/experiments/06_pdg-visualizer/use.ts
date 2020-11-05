import {Ref, ref, UnwrapRef, watch} from 'vue'

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
