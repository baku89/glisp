import {SetupContext} from 'vue'

export default function useEfficientEmit<T extends Record<string, any>>(
	props: Readonly<T>,
	context: SetupContext<any>,
	model: keyof T
) {
	return function (value: any) {
		if (value !== props[model]) {
			context.emit(`update:${model}`, value)
		}
	}
}
