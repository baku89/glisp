<template>
	<div class="MalExpButton" :class="{compact}" @click="onClick">
		{{ str }}
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
		const str = computed(() => {
			if (isList(props.value) && M_FN in props.value) {
				if (props.compact) {
					return `=`
				} else {
					return `ƒ(${printExp(props.value[0])})`
				}
			} else {
				return printExp(props.value)
			}
		})

		function onClick() {
			context.emit('click')
		}

		return {
			str,
			onClick
		}
	}
})
</script>

<style lang="stylus" scoped>
@import '../style/common.styl'

.MalExpButton
	overflow hidden
	max-width 100%
	height $input-height
	color var(--comment)
	text-overflow ellipsis
	white-space nowrap
	line-height $input-height
	font-monospace()
	cursor pointer

	&.compact
		width 1.1rem
		height 1.1rem
		text-align center
		font-size .9em
		line-height .7em
		padding .2em
		border-radius 2px
		border 1px solid var(--border)
		//color var(--background)


	&:hover
		color var(--hover)
</style>
