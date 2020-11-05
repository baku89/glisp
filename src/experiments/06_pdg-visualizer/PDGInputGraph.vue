<template>
	<div class="PDGInputGraph">
		<div class="PDGInputGraph__fn-name">Graph</div>
		<dl class="PDGInputGraph__entries">
			<div
				class="PDGInputGraph__entry"
				v-for="[sym, value] in entries"
				:key="sym"
			>
				<dt
					class="PDGInputGraph__entry-symbol"
					:class="{output: outputSymbol === sym}"
					@dblclick="setOutput(sym)"
				>
					{{ sym }}
				</dt>
				<dd class="PDGInputGraph__entry-expr">
					<PDGInputExp
						:modelValue="value"
						@update:modelValue="onUpdateValue(sym, $event)"
					/>
				</dd>
			</div>
		</dl>
	</div>
</template>

<script lang="ts">
import {computed, defineComponent, PropType, toRaw} from 'vue'

import {addDups, deleteAllDups, PDG, PDGGraph, setDirty} from './repl'

export default defineComponent({
	name: 'PDGInputGraph',
	props: {
		modelValue: {
			type: Object as PropType<PDGGraph>,
			required: true,
		},
	},
	emits: ['update:modelValue'],
	setup(props, context) {
		const entries = computed(() => {
			return Object.entries(props.modelValue.values)
		})

		const outputSymbol = computed(() => {
			return props.modelValue.return
		})

		function cloneNewValue() {
			const oldValue = toRaw(props.modelValue)
			const newValue: PDGGraph = {...oldValue}

			setDirty(oldValue)
			deleteAllDups(oldValue)

			return newValue
		}

		function setOutput(sym: string) {
			const newValue = cloneNewValue()

			newValue.return = sym
			newValue.resolved = undefined
			addDups(newValue)

			context.emit('update:modelValue', newValue)
		}

		function onUpdateValue(sym: string, newParam: PDG) {
			const newValue = cloneNewValue()

			newValue.values[sym] = newParam
			newValue.resolved = undefined
			addDups(newValue)

			context.emit('update:modelValue', newValue)
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
		background var(--frame)
		line-height $input-height

	&__entries
		padding-top 0.5rem
		padding-left 1rem
		border-left 1px solid var(--frame)

	&__entry
		display flex

		&-symbol
			flex-grow 0
			width 2rem
			height $input-height
			color var(--comment)
			line-height $input-height

			&.output
				font-weight bold

		&-expr
			flex-grow 1
			margin 0
</style>
