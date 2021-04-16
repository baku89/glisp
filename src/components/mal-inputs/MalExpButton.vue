<template>
	<div class="MalExpButton" @click="onClick" :class="{selectable}">
		<div
			class="MalExpButton__sign"
			:class="{equals: sign === '=', fn: sign === 'f', variable: sign === 'x'}"
		>
			{{ sign }}
		</div>
		<div v-if="!compact" class="MalExpButton__exp">{{ str }}</div>
	</div>
</template>

<script lang="ts">
import {computed, defineComponent, PropType} from 'vue'

import printExp from '@/mal/printer'
import {isMalColl, MalList, MalSymbol, MalVal} from '@/mal/types'
import {getUIBodyExp} from '@/mal/utils'

export default defineComponent({
	name: 'MalExpButton',
	props: {
		value: {
			type: Object as PropType<MalVal>,
			required: true,
		},
		compact: {
			default: false,
		},
	},
	setup(props, context) {
		const sign = computed(() => {
			if (MalList.is(props.value)) {
				return 'f'
			} else if (MalSymbol.is(props.value)) {
				return 'x'
			} else {
				return '='
			}
		})

		const selectable = computed(() => isMalColl(props.value))

		const expBody = computed(() => getUIBodyExp(props.value))

		const str = computed(() => {
			if (sign.value === 'f') {
				if (props.compact) {
					return ''
				} else {
					return `${printExp((expBody.value as MalVal[])[0])}`
				}
			} else {
				return printExp(expBody.value)
			}
		})

		function onClick() {
			if (selectable.value) {
				context.emit('select', expBody.value)
			}
		}

		return {
			sign,
			selectable,
			str,
			onClick,
		}
	},
})
</script>

<style lang="stylus">
@import '../style/common.styl'

.MalExpButton
	display flex
	display flex
	align-items center
	overflow hidden
	max-width 100%
	height $input-height
	color var(--base03)
	font-monospace()
	line-height $input-height

	&.selectable
		cursor pointer
		input-transition(color)

		&:hover
			color var(--red)

			.MalExpButton__sign
				background var(--red)
				color var(--base00)

	&__sign
		flex 1 0 1.1rem
		padding 0.2em
		width 1.1rem
		height 1.1rem
		border-radius 2px
		background var(--base02)
		color var(--base00)
		text-align center
		input-transition(all)

		&.fn, &.variable
			font-weight bold
			font-style italic
			font-family 'EB Garamond', serif

		&.fn
			font-size 1rem
			line-height 0.6rem

		&.variable
			font-size 1.2rem
			line-height 0.5rem

		&.equals
			text-indent -0.05em
			font-size 1.2rem
			line-height 0.6rem

	&__exp
		flex 1 0 auto
		margin-left 4px
		text-overflow ellipsis
		white-space nowrap
</style>
