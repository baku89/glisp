<template>
	<Splitpanes
		class="SidePane glisp-theme"
		@resize="sidePaneWidth = $event[1].size"
	>
		<Pane :size="100 - sidePaneWidth" v-bind="mainAttr">
			<slot name="main" />
		</Pane>
		<Pane :size="sidePaneWidth" v-bind="sideAttr">
			<slot name="side" />
		</Pane>
	</Splitpanes>
</template>

<script lang="ts">
import 'splitpanes/dist/splitpanes.css'

import {useLocalStorage} from '@vueuse/core'
import {Pane, Splitpanes} from 'splitpanes'
import {defineComponent, ref} from 'vue'

export default defineComponent({
	name: 'SidePane',
	components: {Pane, Splitpanes},
	props: {
		uid: {
			type: String,
		},
		mainAttr: {
			type: Object,
			default: () => ({}),
		},
		sideAttr: {
			type: Object,
			default: () => ({}),
		},
	},
	setup(props) {
		const defaultSidePaneWidth = 40
		const sidePaneWidth = props.uid
			? useLocalStorage(`ui.SidePane.${props.uid}`, defaultSidePaneWidth)
			: ref(defaultSidePaneWidth)

		return {sidePaneWidth}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/common.styl'
</style>
