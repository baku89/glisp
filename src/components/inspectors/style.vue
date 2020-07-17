<template>
	<div class="Inspector-style">
		<Draggable
			:value="styles"
			@input="sortStyles"
			handle=".Inspector-style__handle"
		>
			<TransitionGroup>
				<div
					class="Inspector-style__style"
					v-for="(style, i) in styles"
					:key="i"
				>
					<ParamControl
						:exp="style"
						@input="updateStyleAt($event, i)"
						@select="$emit('select', $event)"
					/>
					<i
						class="Inspector-style__delete far fa-times-circle"
						@click="deleteStyleAt(i)"
					/>
					<i class="Inspector-style__handle fa fa-align-justify handle"></i>
				</div>
			</TransitionGroup>
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

<script lang="ts">
import {defineComponent, SetupContext, computed} from '@vue/composition-api'
import Draggable from 'vuedraggable'
import {
	MalVal,
	isList,
	isVector,
	MalSeq,
	cloneExp,
	createList as L,
	symbolFor as S
} from '@/mal/types'
import {NonReactive, nonReactive} from '@/utils'
import ParamControl from '@/components/ParamControl.vue'
import {printExp} from '../../mal'

interface Props {
	exp: NonReactive<MalVal[]>
}

export default defineComponent({
	name: 'Inspector-style',
	components: {
		Draggable,
		ParamControl
	},
	props: {
		exp: {
			required: true,
			validator: x => x instanceof NonReactive && isList(x.value)
		}
	},
	setup(props: Props, context: SetupContext) {
		const styles = computed(() => {
			const styles = props.exp.value[1]
			return (isVector(styles) ? styles : [styles]).map(s => nonReactive(s))
		})

		function updateStyleAt(style: NonReactive<MalSeq>, i: number) {
			const newExp = cloneExp(props.exp.value)
			const newStyles = styles.value.map(s => s.value)
			newStyles[i] = style.value
			newExp[1] = newStyles.length == 1 ? newStyles[0] : newStyles

			context.emit('input', nonReactive(newExp))
		}

		function sortStyles(styles: NonReactive<MalSeq>[]) {
			const newExp = cloneExp(props.exp.value)
			const newStyles = styles.map(s => s.value)
			newExp[1] = newStyles.length == 1 ? newStyles[0] : newStyles

			context.emit('input', nonReactive(newExp))
		}

		function appendStyle(type: 'fill' | 'stroke') {
			const style =
				type === 'fill' ? L(S('fill'), '#000000') : L(S('stroke'), '#000000', 1)

			const newExp = cloneExp(props.exp.value)
			const newStyles = styles.value.map(s => s.value)
			newStyles.push(style)
			newExp[1] = newStyles.length == 1 ? newStyles[0] : newStyles

			context.emit('input', nonReactive(newExp))
		}

		function deleteStyleAt(i: number) {
			const newExp = cloneExp(props.exp.value)
			const newStyles = styles.value.map(s => s.value)
			newStyles.splice(i, 1)
			newExp[1] = newStyles.length == 1 ? newStyles[0] : newStyles

			context.emit('input', nonReactive(newExp))
		}

		return {styles, updateStyleAt, sortStyles, appendStyle, deleteStyleAt}
	}
})
</script>

<style lang="stylus">
@import '../style/common.styl'

.Inspector-style
	&__style
		display flex
		align-items center
		padding-bottom .5rem
		margin-bottom .5rem
		border-bottom 1px dotted var(--border)

		& > *
			display block

	&__delete, &__handle
		opacity 0
		margin-right 0.5rem
		transition opacity .05s ease

		~/__style:hover &
			opacity 1

	&__delete
		color var(--comment)
		line-height $param-height
		cursor pointer

		&:hover
			color var(--warning)

	&__handle
		color var(--comment)
		height 100%
		cursor all-scroll

	&__append
		display flex
		justify-content center

	&__append-button
		cursor pointer
		line-height $param-height
		margin-top 0.3em
		padding 0.2em 0.6em
		height auto
		border 1px solid var(--comment)
		border-radius 3px
		color var(--comment)
		font-size 0.9em
		margin 0 .5rem


		&:hover
			border-color var(--highlight)
			color var(--highlight)
</style>
