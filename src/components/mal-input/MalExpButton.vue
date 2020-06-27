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
import {defineComponent, computed} from '@vue/composition-api'
import {MalVal, isList, M_FN, isSymbol} from '@/mal/types'
import printExp from '@/mal/printer'

interface Props {
	value: MalVal
	compact: boolean
}

export default defineComponent({
	name: 'MalExpButton',
	props: {
		value: {
			required: true
		},
		compact: {
			default: false
		}
	},
	setup(props: Props, context) {
		const sign = computed(() => {
			if (isList(props.value) && M_FN in props.value) {
				return 'f'
			} else if (isSymbol(props.value)) {
				return 'x'
			} else {
				return '='
			}
		})

		const selectable = computed(() => !isSymbol(props.value))

		const str = computed(() => {
			if (sign.value === 'f') {
				if (props.compact) {
					return ''
				} else {
					return `(${printExp((props.value as MalVal[])[0])})`
				}
			} else {
				return printExp(props.value)
			}
		})

		function onClick() {
			if (selectable.value) {
				context.emit('click')
			}
		}

		return {
			sign,
			selectable,
			str,
			onClick
		}
	}
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
