<script lang="ts" setup>
import {computed, ref} from 'vue'

import {markParent} from '@/glisp/reader'
import {
	cloneExpr,
	createList as L,
	isVector,
	ExprSeq,
	Expr,
	symbolFor as S,
} from '@/glisp/types'
import {getParamLabel} from '@/utils'

interface Props {
	exp: Expr[]
}
const props = defineProps<Props>()

const emit = defineEmits<{
	input: [exp: Expr[]]
	select: [exp: Expr]
	'end-tweak': []
}>()

const styles = computed(() => {
	const styles = props.exp[1]
	return isVector(styles) ? styles : [styles]
})

const labels = computed(() => {
	return styles.value.map(s => getParamLabel((s as ExprSeq)[0]))
})

function updateStyleAt(style: ExprSeq, i: number) {
	const newExp = cloneExpr(props.exp)
	const newStyles = styles.value.map(s => s)
	newStyles[i] = style
	newExp[1] = newStyles.length === 1 ? newStyles[0] : newStyles

	markParent(newExp)
	emit('input', newExp)
}

function sortStyles(sortedStyles: ExprSeq[][]) {
	const newExp = cloneExpr(props.exp)
	newExp[1] = sortedStyles.length === 1 ? sortedStyles[0] : sortedStyles

	markParent(newExp)
	emit('input', newExp)
	emit('end-tweak')
}

function appendStyle(type: 'fill' | 'stroke') {
	const style =
		type === 'fill' ? L(S('fill'), '#000000') : L(S('stroke'), '#000000', 1)

	const newExp = cloneExpr(props.exp)
	const newStyles = [...styles.value]
	newStyles.push(style)
	newExp[1] = newStyles.length === 1 ? newStyles[0] : newStyles

	markParent(newExp)
	emit('input', newExp)
	emit('end-tweak')
}

function deleteStyleAt(i: number) {
	const newExp = cloneExpr(props.exp)
	const newStyles = [...styles.value]
	newStyles.splice(i, 1)
	newExp[1] = newStyles.length === 1 ? newStyles[0] : newStyles

	markParent(newExp)
	emit('input', newExp)
	emit('end-tweak')
}

const dragOptions = ref({
	animation: 100,
	group: 'description',
	disable: false,
	ghostClass: 'ghost',
})

const dragging = ref(false)
</script>

<template>
	<div class="Inspector-style" :class="{dragging}">
		<Draggable
			tag="table"
			class="Inspector-style__table"
			:value="styles"
			v-bind="dragOptions"
			handle=".Inspector-style__handle"
			@start="dragging = true"
			@end="dragging = false"
			@input="sortStyles"
		>
			<tr v-for="(style, i) in styles" :key="i" class="Inspector-style__style">
				<td class="Inspector-style__label">{{ labels[i] }}</td>
				<td class="Inspector-style__input">
					<ExprSelectButton
						:value="style"
						:compact="true"
						@select="$emit('select', $event)"
					/>
					<ExprInputParam
						class="Inspector-style__param"
						:value="style"
						@input="updateStyleAt($event, i)"
						@end-tweak="$emit('end-tweak')"
					/>
					<i
						class="Inspector-style__delete far fa-times-circle"
						@click="deleteStyleAt(i)"
					/>
					<i class="Inspector-style__handle fa fa-align-justify handle"></i>
				</td>
			</tr>
			<!-- </TransitionGroup> -->
		</Draggable>

		<div class="Inspector-style__append">
			<button
				class="Inspector-style__append-button"
				@click="appendStyle('fill')"
			>
				+ Add Fill
			</button>
			<button
				class="Inspector-style__append-button"
				@click="appendStyle('stroke')"
			>
				+ Add Stroke
			</button>
		</div>
	</div>
</template>

<style lang="stylus">
@import '../style/common.styl'

.Inspector-style
	&__table
		margin 0
		padding 0
		width 100%
		border-collapse collapse

	&__style
		margin 0
		padding 0

	&__label, &__input
		margin 0
		padding 0.5rem 0
		// border-bottom 1px dotted var(--border)

	&__label
		width 5rem
		color var(--comment)

	&__input
		display flex
		align-items center

	&__param
		flex-grow 1

	&__delete, &__handle
		display block
		margin-right 0.5rem
		opacity 0
		transition opacity 0.05s ease

		~/__style:hover &
			opacity 1

		~/.dragging &
			opacity 0 !important

	&__delete
		color var(--comment)
		line-height $input-height
		cursor pointer

		&:hover
			color var(--tq-color-error)

	&__handle
		height 100%
		color var(--comment)
		cursor all-scroll

	&__append
		display flex
		justify-content center

	&__append-button
		margin 0 0.5rem
		margin-top 0.3em
		padding 0.2em 0.6em
		height auto
		border 1px solid var(--comment)
		border-radius 3px
		color var(--comment)
		font-size 0.9em
		line-height $input-height
		cursor pointer

		&:hover
			border-color var(--highlight)
			color var(--highlight)
</style>
@/glis[/reader@/glis[/types
