<template>
	<div class="ListView">
		<div
			class="ListView__item"
			v-for="[i, item] in items"
			:key="i"
			@click="onClickItem(i)"
		>
			{{ item }}
		</div>
	</div>
</template>

<script lang="ts">
import {defineComponent, PropType, computed} from '@vue/composition-api'
import {NonReactive, nonReactive} from '@/utils'
import {MalVal, isList, isVector, isSeq} from '@/mal/types'
import {printExp} from '../mal'

export default defineComponent({
	name: 'ListView',
	props: {
		exp: {
			type: NonReactive as PropType<NonReactive<MalVal>>,
			required: true
		}
	},
	setup(props, context) {
		const items = computed(() => {
			const exp = props.exp.value

			if (isList(exp) && exp.length >= 1) {
				return exp.slice(1).map((e, i) => [i + 1, printExp(e)])
			} else if (isVector(exp)) {
				return exp.map((e, i) => [i, printExp(e)])
			} else {
				return [[0, printExp(exp)]]
			}
		})

		function onClickItem(i: number) {
			if (isSeq(props.exp.value)) {
				context.emit('select', nonReactive(props.exp.value[i]))
			}
		}

		return {items, onClickItem}
	}
})
</script>

<style lang="stylus">

.ListView
	padding-top 1rem
	width 100%

	&__item
		padding 1rem 1rem 1rem 2rem
		white-space nowrap
		cursor pointer
		color var(--comment)
		text-overflow ellipsis
		overflow hidden
		position relative

		&:after
			content ''
			position absolute
			top 0
			left 0
			width 100%
			height 100%
			background var(--yellow)
			opacity 0
			transition opacity .05s ease

		&:hover
			color var(--foreground)

			&:after
				opacity .1
</style>
