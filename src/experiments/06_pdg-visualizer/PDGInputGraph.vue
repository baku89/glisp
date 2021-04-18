<template>
	<div class="PDGInputGraph">
		<div class="PDGInputGraph__fn-name">Graph</div>
		<div class="PDGInputGraph__entries">
			<div
				class="PDGInputGraph__entry"
				v-for="[sym, value] in entries"
				:key="sym"
			>
				<div
					class="PDGInputGraph__entry-symbol"
					:class="{output: outputSymbol === sym}"
					@dblclick="setOutput(sym)"
				>
					{{ sym }}
				</div>
				<div class="PDGInputGraph__entry-expr">
					<PDGInputExp
						:modelValue="value"
						@update:modelValue="onUpdateValue(sym, $event)"
					/>
				</div>
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import {computed, defineComponent, PropType, toRaw} from 'vue'

import {PDG, PDGGraph} from './glisp'
import {useSwapPDG} from './use'

export default defineComponent({
	name: 'PDGInputGraph',
	props: {
		modelValue: {
			type: Object as PropType<PDGGraph>,
			required: true,
		},
	},
	emits: [],
	setup(props) {
		const swapPDG = useSwapPDG()

		const entries = computed(() => {
			return Object.entries(props.modelValue.values)
		})

		const outputSymbol = computed(() => {
			return props.modelValue.return
		})

		function setOutput(sym: string) {
			const oldValue = toRaw(props.modelValue)
			const newValue = {...oldValue, resolved: undefined, return: sym}

			swapPDG(oldValue, newValue)
		}

		function onUpdateValue(sym: string, newParam: PDG) {
			const oldValue = toRaw(props.modelValue)
			const newValue = {
				...oldValue,
				values: {...oldValue.values},
				resolved: undefined,
			}

			newValue.values[sym] = newParam

			swapPDG(oldValue, newValue)
		}

		return {entries, outputSymbol, onUpdateValue, setOutput}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/common.styl'

.PDGInputGraph
	&__fn-name
		padding-left 0.5rem
		height $input-height
		background $color-frame
		line-height $input-height

	&__entries
		padding-top 0.5rem
		padding-left 1rem
		border-left 1px solid $color-frame

	&__entry
		display flex

		&-symbol
			flex-grow 0
			width 5rem
			height $input-height
			color base16('03')
			line-height $input-height

			&.output
				font-weight bold

		&-expr
			flex-grow 1
			margin 0
</style>
