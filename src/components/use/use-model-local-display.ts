import {extendRef} from '@vueuse/shared'
import {flow} from 'fp-ts/lib/function'
import {chain, isSome, Option} from 'fp-ts/lib/Option'
import {readonly, Ref, ref, SetupContext, toRaw, watch} from 'vue'

import {Validator} from '@/lib/fp'

interface ModelLocalDisplayOptions<T> {
	props: {modelValue: T; updateOnBlur: boolean; validator: Validator<T>}
	read: (v: string) => Option<T>
	show: (v: T) => string
	emit: SetupContext<['update:modelValue']>['emit']
}

export default function useModelLocalDisplay<T>({
	props,
	read,
	show,
	emit,
}: ModelLocalDisplayOptions<T>) {
	const initialValue = toRaw(props.modelValue)
	const local = ref(initialValue) as Ref<T>
	const display = ref(show(initialValue))

	const readAndValidate = flow(read, chain(props.validator))

	watch(
		() => props.modelValue,
		m => {
			local.value = m
			display.value = show(m)
		},
		{flush: 'sync'}
	)

	function setLocal(l: T) {
		const result = props.validator(l)
		if (isSome(result)) {
			if (!props.updateOnBlur) emit('update:modelValue', result.value)
			else local.value = result.value
		}
	}

	function confirmLocal() {
		emit('update:modelValue', local.value)
		display.value = show(local.value)
	}

	function setDisplay(d: string) {
		display.value = d
		if (!props.updateOnBlur) {
			const result = readAndValidate(display.value)
			if (isSome(result)) {
				emit('update:modelValue', result.value)
			}
		}
	}

	function confirmDisplay() {
		const result = readAndValidate(display.value)

		if (isSome(result)) {
			emit('update:modelValue', result.value)
		} else {
			display.value = show(local.value)
		}
	}

	return {
		local: extendRef(readonly(local), {set: setLocal, confirm: confirmLocal}),
		display: extendRef(readonly(display), {
			set: setDisplay,
			confirm: confirmDisplay,
		}),
	}
}
