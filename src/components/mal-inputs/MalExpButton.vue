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
import {defineComponent, computed, SetupContext} from '@vue/composition-api'
import {MalVal, isList, isSymbol, isNode} from '@/mal/types'
import printExp from '@/mal/printer'
import {NonReactive, nonReactive} from '@/utils'
import {getUIBodyExp} from '@/mal/utils'

interface Props {
	value: NonReactive<MalVal>
	compact: boolean
}

export default defineComponent({
	name: 'MalExpButton',
	props: {
		value: {
			required: true,
			validator: v => v instanceof NonReactive,
		},
		compact: {
			default: false,
		},
	},
	setup(props: Props, context: SetupContext) {
		const sign = computed(() => {
			if (isList(props.value.value)) {
				return 'f'
			} else if (isSymbol(props.value.value)) {
				return 'x'
			} else {
				return '='
			}
		})

		const selectable = computed(() => isNode(props.value.value))

		const expBody = computed(() => nonReactive(getUIBodyExp(props.value.value)))

		const str = computed(() => {
			if (sign.value === 'f') {
				if (props.compact) {
					return ''
				} else {
					return `(${printExp((expBody.value.value as MalVal[])[0])})`
				}
			} else {
				return printExp(expBody.value.value)
			}
		})

		function onClick() {
			if (selectable.value) {
				context.emit('click', expBody.value)
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
	max-width 100%
	height $input-height
	color var(--comment)
	line-height $input-height
	font-monospace()
	display flex
	overflow hidden
	padding 2px

	&.selectable
		cursor pointer

		&:hover
			color var(--red)

			.MalExpButton__sign
				background var(--red)
				color var(--background)
				opacity 1

	&__sign
		flex 1 0 1.1rem
		padding 0.2em
		width 1.1rem
		height 1.1rem
		border-radius 2px
		background var(--comment)
		color var(--background)
		text-align center
		opacity 0.8

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
