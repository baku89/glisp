<template>
	<div class="PDGInputFncall">
		<div class="PDGInputFncall__fn-name" :class="{error: errorMsg}">
			{{ fnName }}
		</div>
		<div class="PDGInputFncall__error" v-if="errorMsg">
			{{ errorMsg }}
		</div>
		<div class="PDGInputFncall__params">
			<div
				class="PDGInputFncall__param"
				v-for="(param, i) in modelValue.params"
				:key="i"
			>
				<div class="PDGInputFncall__param-index">{{ i.toString() }}</div>
				<div class="PDGInputFncall__param-expr">
					<PDGInputExp :modelValue="param" :dataType="paramDataTypes[i]" />
				</div>
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import {computed, defineComponent, PropType, toRef} from 'vue'

import {getDataType, PDGFncall, printDataType, printPDG} from './glisp'
import {usePDGEvalauted} from './use'

export default defineComponent({
	name: 'PDGInputFncall',
	props: {
		modelValue: {
			type: Object as PropType<PDGFncall>,
			required: true,
		},
	},
	emits: [],
	setup(props) {
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

		const paramDataTypes = computed(() => {
			const fnType = getDataType(props.modelValue.fn)
			if (fnType instanceof Object) {
				return fnType.params
			}

			return []
		})

		const errorMsg = computed(() =>
			props.modelValue.resolved instanceof Error
				? props.modelValue.resolved.message
				: null
		)

		const {evaluated} = usePDGEvalauted(toRef(props, 'modelValue'))

		return {fnName, errorMsg, evaluated, paramDataTypes}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/common.styl'

.PDGInputFncall
	&__fn-name
		padding-left 0.5rem
		height $input-height
		background $color-frame
		line-height $input-height

		&.error
			background var(--error)
			color base16('00')

	&__error
		color var(--error)
		line-height $input-height

	&__params
		padding-top 0.5rem
		padding-left 1rem
		border-left 1px solid $color-frame

	&__param
		display flex

		&-index
			flex-grow 0
			width 2rem
			height $input-height
			color base16('03')
			line-height $input-height

		&-expr
			flex-grow 1
			margin 0
</style>
