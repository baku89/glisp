import {SetupContext} from 'vue'

export default function useEfficientEmit(
	props: Readonly<any>,
	context: SetupContext<any>,
	model = 'modelValue'
) {
	return function (value: any) {
		if (value !== props[model]) {
			context.emit(`update:${model}`, value)
		}
	}
}
