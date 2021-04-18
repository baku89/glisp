<template>
	<div class="Inspector">
		<div class="Inspector__header">
			<div class="Inspector__name">
				{{ fnName }}
				<span v-if="fnInfo && fnInfo.aliasFor" class="alias">
					<span class="fira-code">--></span>
					alias for
					{{ fnInfo.aliasFor }}
				</span>
				<button class="Inspector__outer" v-if="outer" @click="onSelectOuter">
					<i class="fas fa-level-up-alt" />
				</button>
			</div>
			<div class="Inspector__doc">
				{{ fnDoc }}
			</div>
		</div>
		<div class="Inspector__body">
			<component
				:is="inspectorName"
				:exp="exp"
				@input="onInput"
				@select="$emit('select', $event)"
				@end-tweak="$emit('end-tweak')"
			/>
		</div>
	</div>
</template>

<script lang="ts">
import {computed, defineComponent, PropType} from 'vue'

import Inspectors from '@/components/inspectors'
import {MalColl, MalList, MalSymbol, MalType, MalVal} from '@/mal/types'
import {copyDelimiters, getFnInfo, isUIAnnotation} from '@/mal/utils'

import ParamControl from './ParamControl.vue'

export default defineComponent({
	name: 'Inspector',
	components: {
		ParamControl,
		...Inspectors,
	},
	props: {
		exp: {
			type: Object as PropType<MalColl>,
			required: true,
		},
	},
	setup(props, context) {
		const fnInfo = computed(() => {
			return getFnInfo(props.exp)
		})

		const fnName = computed(() => {
			if (fnInfo.value?.structType) {
				return fnInfo.value.structType
			} else if (MalList.is(props.exp) && MalSymbol.is(props.exp.fn)) {
				return props.exp.fn.value
			} else {
				return '<anonymous>'
			}
		})

		const fnDoc = computed(() => {
			if (fnInfo.value?.meta) {
				return getExpByPath(fnInfo.value.meta, 'doc', MalType.String) as string
			}
			return ''
		})

		const outer = computed(() => {
			let outer = getOuter(props.exp)
			if (isUIAnnotation(outer)) {
				outer = getOuter(outer)
			}

			if (getOuter(outer)) {
				return outer
			}
			return undefined
		})

		const inspectorName = computed(() => {
			const customInspector = `Inspector-${fnName.value}`
			return customInspector in Inspectors ? customInspector : 'ParamControl'
		})

		function onSelectOuter() {
			context.emit('select', outer.value)
		}

		function onInput(newExp: MalVal) {
			copyDelimiters(newExp, props.exp)
			context.emit('input', newExp)
		}

		return {
			fnInfo,
			fnName,
			fnDoc,
			inspectorName,
			outer,
			onSelectOuter,
			onInput,
		}
	},
})
</script>

<style lang="stylus">
@import 'style/common.styl'

.Inspector
	position relative
	padding 1rem 0.5rem 1rem 1rem
	height 100%
	text-align left
	user-select none

	.fira-code
		font-monospace()

	&__header
		position relative
		margin-bottom 1em

	&__name
		margin-bottom 0.5em
		font-weight bold

		.alias
			color base16('03')
			font-weight normal
			font-size 0.95em

	&__outer
		position absolute
		top 0
		right 0
		color base16('03')
		opacity 0.6

		&:hover
			color base16('accent')
			opacity 1

	&__doc
		line-height 1.4

		code
			color base16('0D')

	&__body
		overflow-y scroll
		max-height 20rem
</style>
