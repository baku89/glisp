<template>
	<div
		class="MalExpButton"
		@click="onClick"
		:class="{equals: symbolType === '=', fn: symbolType === 'f'}"
	>
		<div class="MalExpButton__symbol">
			{{ symbolType }}
		</div>
		<div v-if="!compact" class="MalExpButton__exp">{{ str }}</div>
	</div>
</template>

<script lang="ts">
import {defineComponent, computed} from '@vue/composition-api'
import {MalVal, isList, M_FN} from '@/mal/types'
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
		const symbolType = computed(() => {
			if (isList(props.value) && M_FN in props.value) {
				return 'f'
			} else {
				return '='
			}
		})

		const str = computed(() => {
			if (symbolType.value === 'f') {
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
			if (symbolType.value === 'f') {
				context.emit('click')
			}
		}

		return {
			symbolType,
			str,
			onClick
		}
	}
})
</script>

<style lang="stylus" scoped>
@import '../style/common.styl'

.MalExpButton
	max-width 100%
	height $input-height
	color var(--comment)
	line-height $input-height
	font-monospace()
	display flex
	padding 2px

	&.fn
		cursor pointer

		&:hover
			color var(--syntax-keyword)

			.MalExpButton__symbol
				background var(--syntax-keyword)
				color var(--background)
				opacity 1

	&__symbol
		width 1.1rem
		height 1.1rem
		flex 1 0 @width
		text-align center
		font-size .7em
		line-height 1rem
		padding .2em
		background var(--comment)
		color var(--background)
		border-radius 2px
		opacity .4

	&.equals &__symbols
		font-size 1em
		line-height .8em

	&__exp
		margin-left 4px
		text-overflow ellipsis
		flex 1 0 auto
		white-space nowrap
</style>
