<template>
	<div class="ListView">
		<div
			class="ListView__label"
			:class="{clickable: !!items.children, selected}"
			@click="items.children && onClick()"
		>
			<div class="ListView__icon">
				<i
					v-if="items.icon.type === 'fontawesome'"
					class="fas"
					:class="items.icon.value"
					:style="items.icon.style"
				/>
				<span v-if="items.icon.type === 'text'" :style="items.icon.style">{{items.icon.value}}</span>
				<span
					class="serif"
					v-if="items.icon.type === 'serif'"
					:style="items.icon.style"
				>{{items.icon.value}}</span>
			</div>
			{{ items.label }}
		</div>
		<div class="ListView__children" v-if="items.children">
			<ListView
				v-for="(child, i) in items.children"
				:key="i"
				:exp="child"
				:selectedExp="selectedExp"
				:editingExp="editingExp"
				@select="$emit('select', $event)"
			/>
		</div>
	</div>
</template>

<script lang="ts">
import {defineComponent, PropType, computed} from '@vue/composition-api'
import {NonReactive, nonReactive} from '@/utils'
import {MalVal, isList, isVector, isSeq, MalType, getType} from '@/mal/types'
import {printExp} from '@/mal'

interface Props {
	exp: NonReactive<MalVal>
	selectedExp: NonReactive<MalVal> | null
	editingExp: NonReactive<MalVal> | null
}

const IconTexts = {
	[MalType.Function]: {type: 'serif', value: 'f'},
	[MalType.Number]: {type: 'text', value: '#'},
	[MalType.String]: {
		type: 'fontawesome',
		value: 'fa-quote-right',
		style: 'transform: scale(0.6);'
	},
	[MalType.Symbol]: {type: 'serif', value: 'x'},
	[MalType.Keyword]: {type: 'serif', value: 'x'}
} as {[type: string]: {type: string; value: string; style?: string}}

export default defineComponent({
	name: 'ListView',
	props: {
		exp: {
			required: true
		},
		selectedExp: {
			required: true
		},
		editingExp: {
			required: true
		}
	},
	setup(props: Props, context) {
		const items = computed(() => {
			const exp = props.exp.value

			if (isList(exp)) {
				return {
					label: printExp(exp[0]),
					icon: {type: 'fontawesome', value: 'fa-chevron-down'},
					children: exp.slice(1).map(e => nonReactive(e))
				}
			} else if (isVector(exp)) {
				return {
					label: 'vector',
					icon: {type: 'text', value: '[ ]'},
					children: exp.map(e => nonReactive(e))
				}
			} else {
				return {
					label: printExp(exp, false),
					icon: IconTexts[getType(exp)] || {type: 'text', value: '・'},
					children: null
				}
			}
		})

		const selected = computed(() => {
			return props.selectedExp && props.exp.value === props.selectedExp.value
		})

		function onClick() {
			context.emit('select', props.exp)
		}

		return {items, selected, onClick}
	}
})
</script>

<style lang="stylus">
.ListView
	padding-left 1rem
	width 100%

	&__label
		position relative
		// overflow hidden
		padding 0.5rem 1rem 0.4rem 0
		color var(--comment)
		text-overflow ellipsis
		white-space nowrap

		&.clickable
			color var(--foreground)
			cursor pointer

			&:after
				position absolute
				top 0
				right 0
				left -0.5rem
				height 100%
				background var(--yellow)
				content ''
				opacity 0
				transition opacity 0.05s ease

			&:hover
				color var(--highlight)

				&:after
					opacity 0.1

		&.selected
			font-weight bold

	&__icon
		display inline-block
		margin-right 0.2rem
		width 1rem
		color var(--comment)
		text-align center
		opacity 0.7

		.serif
			font-weight bold
			font-style italic
			font-family 'EB Garamond', serif
			line-height 1rem

	&__children
		position relative

		&:before
			position absolute
			top 0
			left 0.4rem
			width 0
			height 100%
			border-left 1px dotted var(--border)
			content ''
</style>
