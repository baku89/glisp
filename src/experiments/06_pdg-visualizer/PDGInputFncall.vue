<template>
	<div class="PDGFncall">
		<div class="PDGFncall__fn-name">{{ fnName }}</div>
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
import {computed, defineComponent, PropType, toRaw} from 'vue'

import {getDataType, PDG, PDGFncall, printDataType, printPDG} from './repl'

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
			const oldValue = toRaw(props.modelValue)
			const newValue: PDGFncall = {...oldValue}

			oldValue.fn.dep.delete(oldValue)
			oldValue.fn.dep.add(newValue)

			oldValue.params.map(p => {
				p.dep.delete(oldValue)
				p.dep.add(newValue)
			})

			newValue.params[i] = newParam

			context.emit('update:modelValue', newValue)
		}

		return {fnName, onUpdateParam}
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
