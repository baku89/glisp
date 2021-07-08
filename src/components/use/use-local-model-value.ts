import {biSyncRef, syncRef, useVModel} from '@vueuse/core'
import {ref, SetupContext, watch, WatchStopHandle} from 'vue'

export default function useLocalModelValue<
	T extends {modelValue: U; updateOnBlur: boolean},
	U
>(props: T, emit: SetupContext<['update:modelValue']>['emit']) {
	const model = useVModel(props, 'modelValue', emit)
	const local = ref(props.modelValue)
	let stopSync: WatchStopHandle | null = null

	watch(
		() => props.updateOnBlur,
		updateOnBlur => {
			if (stopSync) stopSync()
			stopSync = null

			if (updateOnBlur) {
				stopSync = syncRef(model, local)
			} else {
				stopSync = biSyncRef(model, local)
			}
		},
		{immediate: true}
	)

	return {model, local}
}
