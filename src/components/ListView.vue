<template>
	<div class="ListView">
		<div
			class="ListView__item"
			v-for="[i, label, children] in items"
			:key="i"
			@click="children ? onClickItem(i) : null"
		>
			<div class="ListView__label" :class="{clickable: !!children}">
				<i class="ListView__icon fas" :class="{'fa-chevron-down': !!children}">
					{{ !children ? '・' : '' }}
				</i>
				{{ label }}
			</div>
			<ListView
				v-if="children"
				:exp="children"
				@select="$emit('select', $event)"
			/>
		</div>
	</div>
</template>

<script lang="ts">
import {defineComponent, PropType, computed} from '@vue/composition-api'
import {NonReactive, nonReactive} from '@/utils'
import {MalVal, isList, isVector, isSeq} from '@/mal/types'
import {printExp} from '@/mal'

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
				return exp
					.slice(1)
					.map((e, i) => [
						i + 1,
						isList(e) ? printExp(e[0]) : printExp(e),
						isList(e) ? nonReactive(e) : null
					])
			} else if (isVector(exp)) {
				return exp.map((e, i) => [i, isSeq(e) ? nonReactive(e) : printExp(e)])
			} else {
				return [[0, printExp(exp)]]
			}
		})

		function onClickItem(i: number) {
			if (isSeq(props.exp.value)) {
				context.emit('select', nonReactive(props.exp.value[i]))
			}
		}

		return {items, onClickItem, NonReactive}
	}
})
</script>

<style lang="stylus">

.ListView
	width 100%

	&__item
		padding-left 1.5rem

	&__label
		position relative
		padding .7rem 1rem .7rem 0
		white-space nowrap
		text-overflow ellipsis
		overflow hidden
		color var(--comment)

		&.clickable
			cursor pointer
			color var(--foreground)

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
				color var(--highlight)

				&:after
					opacity .1

	&__icon
		margin-right .6rem
</style>
