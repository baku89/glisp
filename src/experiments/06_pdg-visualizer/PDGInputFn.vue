<template>
	<div class="PDGInputFn">
		<div class="PDGInputFn__header">Function</div>
		<div class="PDGInputFn__row">
			<div class="PDGInputFn__label">params</div>
			<div class="PDGInputFn__value">
				<div
					class="PDGInputFn__param"
					v-for="{symbol, dataType} in params"
					:key="symbol"
				>
					{{ symbol }} = {{ dataType }}
				</div>
			</div>
		</div>
		<div class="PDGInputFn__row">
			<div class="PDGInputFn__label">return</div>
			<div class="PDGInputFn__value">
				<div class="PDGInputFn__param">
					{{ modelValue.def.dataType.out }}
				</div>
			</div>
		</div>
		<div class="PDGInputFn__row">
			<div class="PDGInputFn__label">body</div>
			<div class="PDGInputFn__value">
				<PDGInputExp :modelValue="body" />
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import {computed, defineComponent, PropType} from 'vue'

import {PDGFn} from './repl'
export default defineComponent({
	name: 'PDGInputFn',
	components: {},
	props: {
		modelValue: {
			type: Object as PropType<PDGFn>,
			required: true,
		},
	},
	emits: [],
	setup(props) {
		const isJS = computed(() => props.modelValue.def.type === 'js')

		const params = computed(() => {
			const def = props.modelValue.def
			const {dataType} = def
			if (def.type === 'expr') {
				return dataType.in.map((dt, i) => ({
					dataType: dt,
					symbol: def.params[i],
				}))
			} else {
				return dataType.in.map((dt, i) => ({
					dataType: dt,
					symbol: i.toString(),
				}))
			}
		})

		const body = computed(() => {
			const def = props.modelValue.def
			if (def.type === 'js') {
				return def.value.toString()
			} else {
				return def.body
			}
		})

		// function onUpdate(value: number) {
		// 	const oldValue = toRaw(props.modelValue)
		// 	const newValue = {...oldValue, value}

		// 	swapPDG(oldValue, newValue)
		// }

		return {isJS, params, body}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/common.styl'

.PDGInputFn
	position relative

	&__header
		padding-left 0.5rem
		height $input-height
		background var(--frame)
		line-height $input-height

	&__row
		display flex
		padding-top 0.5rem
		padding-left 1rem
		border-left 1px solid var(--frame)

	&__label
		flex-grow 0
		width 5rem
		height $input-height
		color var(--comment)
		line-height $input-height

	&__param
		height $input-height
		line-height $input-height

	&__value
		flex-grow 1
</style>
