import {pausableWatch} from '@vueuse/core'
import {extendRef} from '@vueuse/shared'
import {flow} from 'fp-ts/lib/function'
import {chain, isSome, Option} from 'fp-ts/lib/Option'
import {computed, readonly, Ref, ref, SetupContext, toRaw, watch} from 'vue'

import {Validator} from '@/lib/fp'

interface ModelLocalDisplayOptions<T> {
	props: {modelValue: T; updateOnBlur: boolean}
	read: (v: string) => Option<T>
	show: (v: T) => string
	validate: Validator<T>
	emit: SetupContext<['update:modelValue']>['emit']
}

export default function useModelLocalDisplay<T>({
	props,
	read,
	show,
	validate,
	emit,
}: ModelLocalDisplayOptions<T>) {
	const initialValue = toRaw(props.modelValue)
	const local = ref(initialValue) as Ref<T>
	const display = ref(show(initialValue))

	const readAndValidate = flow(read, chain(validate))

	pausableWatch(
		() => props.modelValue,
		m => (local.value = m),
		{flush: 'sync'}
	)

	const validDisplay = computed(() => show(local.value))

	const watchLocal = pausableWatch(validDisplay, d => (display.value = d))

	watch(display, d => {
		const result = readAndValidate(d)
		if (isSome(result)) {
			watchLocal.pause()
			if (!props.updateOnBlur) {
				emit('update:modelValue', result.value)
			} else {
				local.value = result.value
			}
			watchLocal.resume()
		}
	})

	function setLocal(l: T) {
		const result = validate(l)
		if (isSome(result)) {
			if (!props.updateOnBlur) {
				emit('update:modelValue', result.value)
			} else {
				local.value = result.value
				display.value = show(result.value)
			}
		}
	}

	function confirmLocal() {
		emit('update:modelValue', local.value)
		display.value = show(local.value)
	}

	function confirmDisplay() {
		const result = readAndValidate(display.value)
		if (isSome(result)) {
			emit('update:modelValue', result.value)
			display.value = show(local.value)
		} else {
			display.value = show(local.value)
		}
	}

	return {
		local: extendRef(readonly(local), {set: setLocal, confirm: confirmLocal}),
		display: extendRef(display, {
			confirm: confirmDisplay,
		}),
	}
}
