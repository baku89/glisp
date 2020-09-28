<template>
	<div ref="el" :data-uid="uid" class="splitpanes__pane" :style="style">
		<slot />
	</div>
</template>

<script lang="ts">
import {
	computed,
	defineComponent,
	inject,
	onMounted,
	onUnmounted,
	ref,
	watch,
} from 'vue'
import generateUID from 'uid'

export default defineComponent({
	name: 'pane',
	props: {
		size: {type: Number, default: null},
		minSize: {type: Number, default: 0},
		maxSize: {type: Number, default: 100},
	},
	setup(props, context) {
		const uid = ref(generateUID())
		const el = ref<null | HTMLElement>(null)

		const style = ref({})

		const {requestUpdate, onPaneAdd, onPaneRemove} = inject('splitpanes') as any

		onMounted(() => {
			onPaneAdd(el, props)
		})

		onUnmounted(() => {
			onPaneRemove(el)
		})

		function update(_style: any) {
			style.value = _style
		}

		watch(
			() => props.size,
			size => requestUpdate({target: this, size: size})
		)

		watch(
			() => props.minSize,
			min => requestUpdate({target: this, min})
		)

		watch(
			() => props.maxSize,
			max => requestUpdate({target: this, max})
		)

		return {
			uid,
			el,
			style,
			update,
		}
	},
})
</script>
