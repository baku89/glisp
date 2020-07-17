<template>
	<div class="Inspector-style">
		<div class="Inspector-style__style" v-for="(style, i) in styles" :key="i">
			<ParamControl
				:exp="style"
				@input="onInputStyle($event, i)"
				@select="$emit('select', $event)"
			/>
		</div>
		<div class="Inspector-style__add">
			<button class="Inspector-style__button" @click="addStyle('fill')">
				+ Add Fill
			</button>
			<button class="Inspector-style__button" @click="addStyle('stroke')">
				+ Add Stroke
			</button>
		</div>
	</div>
</template>

<script lang="ts">
import {defineComponent, SetupContext, computed} from '@vue/composition-api'
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
interface Props {
	exp: NonReactive<MalVal[]>
}

export default defineComponent({
	name: 'Inspector-style',
	components: {
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

		function onInputStyle(style: NonReactive<MalSeq>, i: number) {
			const newExp = cloneExp(props.exp.value)
			const newStyles = styles.value.map(s => s.value)
			newStyles[i] = style.value
			newExp[1] = newStyles.length == 1 ? newStyles[0] : newStyles

			context.emit('input', nonReactive(newExp))
		}

		function addStyle(type: 'fill' | 'stroke') {
			const style =
				type === 'fill' ? L(S('fill'), '#000000') : L(S('stroke'), '#000000', 1)

			const newExp = cloneExp(props.exp.value)
			const newStyles = styles.value.map(s => s.value)
			newStyles.push(style)
			newExp[1] = newStyles.length == 1 ? newStyles[0] : newStyles

			context.emit('input', nonReactive(newExp))
		}

		return {styles, onInputStyle, addStyle}
	}
})
</script>

<style lang="stylus">
@import '../style/common.styl'

.Inspector-style
	&__style
		padding-bottom .5rem
		margin-bottom .5rem
		border-bottom 1px dotted var(--border)

	&__add
		display flex
		justify-content center
	&__button
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
