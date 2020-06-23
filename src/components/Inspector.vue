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
			<VueMarkdown class="Inspector__doc" :source="fnDoc" />
		</div>
		<ParamControl
			:exp="exp"
			@input="$emit('input', $event)"
			@select="$emit('select', $event)"
		/>
	</div>
</template>

<script lang="ts">
import {Component, Vue, Prop} from 'vue-property-decorator'
import VueMarkdown from 'vue-markdown'

import {
	MalVal,
	isList,
	isSymbol,
	keywordFor as K,
	MalNode,
	MalSymbol,
	M_OUTER
} from '@/mal/types'

import ParamControl from './ParamControl.vue'

import CubicBezier from '@/components/inspectors/cubic-bezier.vue'
import {NonReactive, nonReactive} from '@/utils'
import {getFnInfo} from '@/mal-utils'
import {defineComponent, computed, SetupContext} from '@vue/composition-api'

interface Props {
	exp: NonReactive<MalNode>
}

export default defineComponent({
	name: 'Inspector',
	components: {
		VueMarkdown,
		ParamControl,
		'cubic-bezier': CubicBezier
	},
	props: {
		exp: {
			required: true,
			validator: p => p instanceof NonReactive
		}
	},
	setup(props: Props, context: SetupContext) {
		const fnInfo = computed(() => {
			return getFnInfo(props.exp.value)
		})

		const fnName = computed(() => {
			if (fnInfo.value?.primitive) {
				return fnInfo.value.primitive
			} else if (
				fnInfo.value?.fn ||
				(isList(props.exp.value) && isSymbol(props.exp.value[0]))
			) {
				return ((props.exp.value as MalVal[])[0] as MalSymbol).value || ''
			} else {
				return ''
			}
		})

		const fnDoc = computed(() => {
			if (fnInfo.value?.meta) {
				return fnInfo.value.meta[K('doc')] as string
			}
			return ''
		})

		const outer = computed(() => {
			if (props.exp.value[M_OUTER] && props.exp.value[M_OUTER][M_OUTER]) {
				return props.exp.value[M_OUTER]
			}
			return undefined
		})

		function onSelectOuter() {
			context.emit('select', nonReactive(outer.value))
		}

		return {
			fnInfo,
			fnName,
			fnDoc,
			outer,
			onSelectOuter
		}
	}
})
</script>

<style lang="stylus">
@import 'style/common.styl'

.Inspector
	position relative
	padding 1rem
	height 100%
	text-align left
	user-select none
	translucent-bg()

	.fira-code
		font-monospace()

	&__header
		position relative
		margin-bottom 1em

	&__name
		margin-bottom 0.5em
		font-weight bold

		.alias
			color var(--comment)
			font-weight normal
			font-size 0.95em

	&__outer
		position absolute
		top 0
		right 0
		color var(--comment)
		opacity 0.6

		&:hover
			color var(--hover)
			opacity 1

	&__doc code
		color var(--syntax-function)
</style>
