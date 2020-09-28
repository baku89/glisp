<template>
	<div class="GlobalPanes">
		<div class="GlobalPanes__pane left" :style="{width: `${leftWidth}rem`}">
			<slot name="left" />
		</div>
		<div class="GlobalPanes__pane main">
			<slot name="main" />
		</div>
		<div class="GlobalPanes__pane right" :style="{width: `${rightWidth}rem`}">
			<slot name="right" />
		</div>
	</div>
</template>

<script lang="ts">
import {defineComponent, ref} from 'vue'

export default defineComponent({
	name: 'GlobalPanes',
	setup() {
		const leftWidth = ref(15)
		const rightWidth = ref(30)

		return {
			leftWidth,
			rightWidth,
		}
	},
})
</script>

<style lang="stylus">
.GlobalPanes
	display flex

	&__pane
		position relative

		&.left
			border-right 1px solid var(--border)

		&.main
			flex-grow 1

		&.right
			border-left 1px solid var(--border)
</style>
