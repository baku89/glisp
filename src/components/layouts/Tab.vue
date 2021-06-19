<template>
	<div class="Tab">
		<ul class="Tab__header">
			<li
				class="Tab__head"
				v-for="tab in tabs"
				:key="tab"
				:class="{active: activeTab === tab}"
				@click="switchTab(tab)"
			>
				<slot :name="tabHeadSlotName(tab)"> {{ tab }}</slot>
			</li>
		</ul>
		<main class="Tab__panel">
			<slot :name="tabPanelSlotName"></slot>
		</main>
	</div>
</template>

<script lang="ts">
import {computed, defineComponent, PropType, ref} from 'vue'

export default defineComponent({
	name: 'Tab',
	props: {
		initialTab: {
			type: String,
			required: true,
		},
		tabs: {
			type: Array as PropType<string[]>,
			required: true,
		},
	},
	setup(props) {
		const activeTab = ref(props.initialTab)

		const tabPanelSlotName = computed(() => `panel-${activeTab.value}`)

		function tabHeadSlotName(tab: string) {
			return `head-${tab}`
		}

		function switchTab(tab: string) {
			activeTab.value = tab
		}

		return {
			activeTab,
			tabPanelSlotName,
			tabHeadSlotName,
			switchTab,
		}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/common.styl'

.Tab
	display grid
	width 100%
	height 100%
	grid-template-columns 1fr
	grid-template-rows 2em 1fr

	&__header
		display flex

	&__head
		flex-grow 1
		flex-basis auto
		background base16('01', 0.5)
		color base16('05', 0.5)
		text-align center
		line-height 2em
		user-select none
		input-transition()

		&:hover
			background base16('01')
			color base16('accent')

		&.active
			background transparent
			color base16('05')

	&__panel
		padding 1.8em
</style>
