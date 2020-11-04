<template>
	<div class="PDGFncall">
		<div class="PDGFncall__fn-name">{{ fnName }}</div>
		<div class="PDGFncall__params">
			<template v-for="(param, i) in modelValue.params" :key="i">
				<PDGInputExp
					:modelValue="param"
					@update:modelValue="onUpdateParam(i, $event)"
				/>
			</template>
		</div>
	</div>
</template>

<script lang="ts">
import {computed, defineComponent, PropType, toRaw} from 'vue'
import {
	PDG,
	PDGFncall,
	printPDG,
	evalPDG,
	printValue,
	printDataType,
	getDataType,
} from './repl'
import PDGInputExp from './PDGInputExp.vue'

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
		const fnName = computed(
			() =>
				printPDG(props.modelValue.fn) +
				' : ' +
				printDataType(getDataType(props.modelValue.fn) || 'number').slice(1, -1)
		)

		function onUpdateParam(i: number, newParam: PDG) {
			const newValue: PDGFncall = {...toRaw(props.modelValue)}
			newValue.params[i] = newParam

			context.emit('update:modelValue', newValue)
		}

		return {fnName, onUpdateParam}
	},
})
</script>

<style lang="stylus">
@import '../../components/style/common.styl'

.PDGFncall
	&__fn-name
		padding-left 0.5rem
		height $input-height
		background var(--frame)
		line-height $input-height

	&__params
		padding-top 0.5rem
		padding-left 1rem
		border-left 1px solid var(--frame)
</style>