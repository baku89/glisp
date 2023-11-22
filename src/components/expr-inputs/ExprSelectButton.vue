<template>
	<div class="ExprSelectButton" :class="{selectable}" @click="onClick">
		<div
			class="ExprSelectButton__sign"
			:class="{equals: sign === '=', fn: sign === 'f', variable: sign === 'x'}"
		>
			{{ sign }}
		</div>
		<div v-if="!compact" class="ExprSelectButton__exp">{{ str }}</div>
	</div>
</template>

<script lang="ts" setup>
import {computed} from 'vue'

import {Expr, isColl, isList, isSymbol, printExpr} from '@/glisp'
import {useSketchStore} from '@/stores/sketch'

interface Props {
	value: Expr
	compact?: boolean
}

const sketch = useSketchStore()

const props = defineProps<Props>()

const sign = computed(() => {
	if (isList(props.value)) {
		return 'f'
	} else if (isSymbol(props.value)) {
		return 'x'
	} else {
		return '='
	}
})

const selectable = computed(() => isColl(props.value))

const str = computed(() => {
	if (sign.value === 'f') {
		if (props.compact) {
			return ''
		} else {
			return `${printExpr((props.value as Expr[])[0])}`
		}
	} else {
		return printExpr(props.value)
	}
})

function onClick() {
	if (isColl(props.value)) {
		sketch.activeExpr = props.value
	}
}
</script>

<style lang="stylus">
@import '../style/common.styl'

.ExprSelectButton
	max-width 100%
	height $input-height
	color var(--comment)
	line-height $input-height
	font-monospace()
	display flex
	display flex
	align-items center
	overflow hidden

	&.selectable
		cursor pointer
		input-transition(color)

		&:hover
			color var(--red)

			.ExprSelectButton__sign
				background var(--red)

	&__sign
		flex 1 0 1.1rem
		padding 0.2em
		width 1.1rem
		height 1.1rem
		border-radius 2px
		background var(--button)
		color var(--background)
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
@/glis[/printer@/glis[/types
