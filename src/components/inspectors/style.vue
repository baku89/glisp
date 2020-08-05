<template>
	<div class="Inspector-style" :class="{dragging}">
		<Draggable
			tag="table"
			class="Inspector-style__table"
			:value="styles"
			v-bind="dragOptions"
			@start="dragging = true"
			@end="dragging = false"
			@input="sortStyles"
			handle=".Inspector-style__handle"
		>
			<tr class="Inspector-style__style" v-for="(style, i) in styles" :key="i">
				<td class="Inspector-style__label">{{ labels[i] }}</td>
				<td class="Inspector-style__input">
					<MalExpButton
						:value="style"
						@select="$emit('select', $event)"
						:compact="true"
					/>
					<MalInputParam
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
			>+ Add Fill</button>
			<button
				class="Inspector-style__append-button"
				@click="appendStyle('stroke')"
			>+ Add Stroke</button>
		</div>
	</div>
</template>

<script lang="ts">
import {
	defineComponent,
	SetupContext,
	computed,
	ref,
} from '@vue/composition-api'
import Draggable from 'vuedraggable'
import {
	MalVal,
	isList,
	isVector,
	MalSeq,
	cloneExp,
	createList as L,
	symbolFor as S,
} from '@/mal/types'
import {NonReactive, nonReactive, getParamLabel} from '@/utils'
import MalInputParam from '@/components/mal-inputs/MalInputParam.vue'
import MalExpButton from '@/components/mal-inputs/MalExpButton.vue'
import {reconstructTree} from '../../mal/reader'

interface Props {
	exp: NonReactive<MalVal[]>
}

export default defineComponent({
	name: 'Inspector-style',
	components: {
		Draggable,
		MalInputParam,
		MalExpButton,
	},
	props: {
		exp: {
			required: true,
			validator: x => x instanceof NonReactive && isList(x.value),
		},
	},
	setup(props: Props, context: SetupContext) {
		const styles = computed(() => {
			const styles = props.exp.value[1]
			return (isVector(styles) ? styles : [styles]).map(nonReactive)
		})

		const labels = computed(() => {
			return styles.value.map(s => getParamLabel((s.value as MalSeq)[0]))
		})

		function updateStyleAt(style: NonReactive<MalSeq>, i: number) {
			const newExp = cloneExp(props.exp.value)
			const newStyles = styles.value.map(s => s.value)
			newStyles[i] = style.value
			newExp[1] = newStyles.length == 1 ? newStyles[0] : newStyles

			reconstructTree(newExp)
			context.emit('input', nonReactive(newExp))
		}

		function sortStyles(sortedStyles: NonReactive<MalSeq[]>[]) {
			const newExp = cloneExp(props.exp.value)
			newExp[1] =
				sortedStyles.length == 1
					? sortedStyles[0].value
					: sortedStyles.map(s => s.value)

			reconstructTree(newExp)
			context.emit('input', nonReactive(newExp))
			context.emit('end-tweak')
		}

		function appendStyle(type: 'fill' | 'stroke') {
			const style =
				type === 'fill' ? L(S('fill'), '#000000') : L(S('stroke'), '#000000', 1)

			const newExp = cloneExp(props.exp.value)
			const newStyles = styles.value.map(s => s.value)
			newStyles.push(style)
			newExp[1] = newStyles.length == 1 ? newStyles[0] : newStyles

			reconstructTree(newExp)
			context.emit('input', nonReactive(newExp))
			context.emit('end-tweak')
		}

		function deleteStyleAt(i: number) {
			const newExp = cloneExp(props.exp.value)
			const newStyles = styles.value.map(s => s.value)
			newStyles.splice(i, 1)
			newExp[1] = newStyles.length == 1 ? newStyles[0] : newStyles

			reconstructTree(newExp)
			context.emit('input', nonReactive(newExp))
			context.emit('end-tweak')
		}

		const dragOptions = ref({
			animation: 100,
			group: 'description',
			disable: false,
			ghostClass: 'ghost',
		})

		const dragging = ref(false)

		return {
			styles,
			labels,
			updateStyleAt,
			sortStyles,
			appendStyle,
			deleteStyleAt,
			dragOptions,
			dragging,
		}
	},
})
</script>

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
			color var(--warning)

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
