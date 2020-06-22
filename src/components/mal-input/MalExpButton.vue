<template>
	<div class="MalExpButton" @click="onClick">{{str}}</div>
</template>

<script lang="ts">
import {
	defineComponent,
	ref,
	Ref,
	watch,
	PropType,
	computed
} from '@vue/composition-api'
import {
	MalNodeSeq,
	isList,
	getMeta,
	M_META,
	M_FN,
	isMap,
	MalVal,
	MalSymbol
} from '../../mal/types'
import printExp from '@/mal/printer'
import {getMapValue, getFnInfo} from '../../mal-utils'

interface Props {
	value: MalVal
}

export default defineComponent({
	name: 'MalExpButton',
	props: {
		value: {
			required: true
		}
	},
	setup(props: Props, context) {
		const str = computed(() => {
			return printExp(props.value, true, true)
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
	height $param-height
	color var(--comment)
	text-overflow ellipsis
	white-space nowrap
	line-height $param-height
	font-monospace()
	cursor pointer

	&:hover
		color var(--aqua)
</style>
