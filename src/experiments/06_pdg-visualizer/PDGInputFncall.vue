<template>
	<div class="PDGFncall">
		<div class="PDGFncall__fn-name" :class="{error: errorMsg}">
			{{ fnName }}
		</div>
		<div class="PDGFncall__error" v-if="errorMsg">
			{{ errorMsg }}
		</div>
		<dl class="PDGFncall__params">
			<div
				class="PDGFncall__param"
				v-for="(param, i) in modelValue.params"
				:key="i"
			>
				<dt class="PDGFncall__param-index">{{ i.toString() }}</dt>
				<dd class="PDGFncall__param-expr">
					<PDGInputExp
						:modelValue="param"
						@update:modelValue="onUpdateParam(i, $event)"
					/>
				</dd>
			</div>
		</dl>
	</div>
</template>

<script lang="ts">
import {computed, defineComponent, PropType, toRaw, toRef} from 'vue'

import {
	addDups,
	deleteAllDups,
	evalPDG,
	getDataType,
	PDG,
	PDGFncall,
	printDataType,
	printPDG,
	printValue,
	setDirty,
} from './repl'
import {useAsyncComputed} from './use'

export default defineComponent({
	name: 'PDGInputFncall',
	props: {
		modelValue: {
			type: Object as PropType<PDGFncall>,
			required: true,
		},
	},
	emits: ['update:modelValue'],
	setup(props, context) {
		const fnName = computed(() => {
			let fn =
				props.modelValue.fn.type === 'symbol'
					? printPDG(props.modelValue.fn)
					: 'f' +
					  ' : ' +
					  printDataType(getDataType(props.modelValue.fn) || 'number').slice(
							1,
							-1
					  )
			return fn + ' => ' + (evaluated.value || 'EVAL ERROR')
		})

		const errorMsg = computed(() =>
			props.modelValue.resolved?.result === 'error'
				? props.modelValue.resolved.message
				: null
		)

		const {value: evaluated} = useAsyncComputed<null | string, PDG>(
			null,
			toRef(props, 'modelValue'),
			async () => {
				try {
					return await printValue(await evalPDG(props.modelValue))
				} catch (err) {
					return null
				}
			}
		)

		function onUpdateParam(i: number, newParam: PDG) {
			const oldValue = toRaw(props.modelValue)
			setDirty(oldValue)
			const newValue: PDGFncall = {...oldValue}

			deleteAllDups(oldValue)

			newValue.params[i] = newParam
			newValue.resolved = undefined
			addDups(newValue)

			context.emit('update:modelValue', newValue)
		}

		return {fnName, onUpdateParam, errorMsg, evaluated}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/common.styl'

.PDGFncall
	&__fn-name
		padding-left 0.5rem
		height $input-height
		background var(--frame)
		line-height $input-height

		&.error
			background var(--error)
			color var(--background)

	&__error
		color var(--error)
		line-height $input-height

	&__params
		padding-top 0.5rem
		padding-left 1rem
		border-left 1px solid var(--frame)

	&__param
		display flex

		&-index
			flex-grow 0
			width 2rem
			height $input-height
			color var(--comment)
			line-height $input-height

		&-expr
			flex-grow 1
			margin 0
</style>
