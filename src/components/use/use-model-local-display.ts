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

	const chainedValidate = chain(validate)
	const readAndValidate = flow(read, chainedValidate)

	// Model -> Local
	watch(
		() => props.modelValue,
		m => (local.value = m),
		{flush: 'sync'}
	)

	// Loal -> Display
	const validDisplay = computed(() => show(local.value))
	const watchLocal = pausableWatch(
		validDisplay,
		d => {
			watchDisplay.pause()
			display.value = d
			watchDisplay.resume()
		},
		{
			flush: 'sync',
		}
	)

	// Display -> Local -> Model
	const parsedDisplay = computed(() => read(display.value))
	const validatedDisplay = computed(() => chainedValidate(parsedDisplay.value))

	const displayInvalid = computed(() => {
		const parsed = parsedDisplay.value,
			validated = validatedDisplay.value
		return !(
			isSome(parsed) &&
			isSome(validated) &&
			parsed.value === validated.value
		)
	})

	const watchDisplay = pausableWatch(
		validatedDisplay,
		result => {
			if (isSome(result)) {
				watchLocal.pause()
				if (!props.updateOnBlur) {
					emit('update:modelValue', result.value)
				}
				local.value = result.value
				watchLocal.resume()
			}
		},
		{
			flush: 'sync',
		}
	)

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
		displayInvalid,
	}
}
