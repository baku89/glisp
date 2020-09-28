<template>
	<div class="splitpanes__pane" :style="style">
		<slot />
	</div>
</template>

<script>
import {
	computed,
	defineComponent,
	onMounted,
	onUnmounted,
	ref,
	watch,
} from 'vue'

export default defineComponent({
	name: 'pane',
	props: {
		size: {type: [Number, String], default: null},
		minSize: {type: [Number, String], default: 0},
		maxSize: {type: [Number, String], default: 100},
	},
	setup(props) {
		const style = ref({})

		const sizeNumber = computed(() =>
			props.size ? parseFloat(props.size) : null
		)
		const minSizeNumber = computed(() => parseFloat(props.minSize))
		const maxSizeNumber = computed(() => parseFloat(props.maxSize))

		onMounted(() => {
			this.$parent.onPaneAdd(this)
		})

		onUnmounted(() => {
			this.$parent.onPaneRemove(this)
		})

		function update(_style) {
			style.value = _style
		}

		console.log(this.$parent.requestUpdate)

		watch(
			() => sizeNumber.value,
			size => this.$parent.requestUpdate({target: this, size})
		)

		watch(
			() => minSizeNumber.value,
			min => this.$parent.requestUpdate({target: this, min})
		)

		watch(
			() => maxSizeNumber.value,
			max => this.$parent.requestUpdate({target: this, max})
		)

		return {
			style,
			update,
		}
	},
})
</script>
