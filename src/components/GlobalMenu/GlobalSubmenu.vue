<template>
	<div class="GlobalSubmenu">
		<div
			class="GlobalSubmenu__item"
			v-for="[label, command] in menu"
			@click="onClick(command)"
			:key="label"
		>{{label}}</div>
	</div>
</template>

<script lang="ts">
import {Component, Vue, Prop} from 'vue-property-decorator'

@Component({
	name: 'GlobalSubmenu'
})
export default class GlobalSubmenu extends Vue {
	@Prop({type: Array, required: true}) menu!: [string, string][]

	onClick(command: string) {
		this.$emit('click', command)
	}
}
</script>


<style lang="stylus" scoped>
.GlobalSubmenu
	position relative
	border 1px solid var(--comment)
	border-radius 0.3rem
	background var(--background)
	white-space nowrap
	user-select none

	&__item
		padding 0 1rem
		height 3.2rem
		border-bottom 1px dotted var(--comment)
		color var(--comment)
		// background red
		line-height 3.2rem
		cursor pointer

		&:hover
			color var(--aqua)

		&:last-child
			border none
</style>