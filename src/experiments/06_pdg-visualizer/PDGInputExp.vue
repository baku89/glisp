<template>
	<div class="PDGInputExp">
		<template v-if="!isEditingCode">
			<component :is="type" :modelValue="modelValue" :dataType="dataType" />
			<button class="PDGInputExp__edit-exp" @click="isEditingCode = true">
				Edit
			</button>
		</template>
		<PDGInputCode
			v-else
			:modelValue="modelValue"
			@confirm="isEditingCode = false"
		/>
	</div>
</template>

<script lang="ts">
import {computed, defineComponent, PropType, ref} from 'vue'

import PDGInputBoolean from './PDGInputBoolean.vue'
import PDGInputCode from './PDGInputCode.vue'
import PDGInputFncall from './PDGInputFncall.vue'
import PDGInputGraph from './PDGInputGraph.vue'
import PDGInputNumber from './PDGInputNumber.vue'
import PDGInputSymbol from './PDGInputSymbol.vue'
import {DataType, PDG} from './repl'

export default defineComponent({
	name: 'PDGInputExp',
	components: {
		PDGInputNumber,
		PDGInputBoolean,
		PDGInputFncall,
		PDGInputGraph,
		PDGInputSymbol,
		PDGInputCode,
	},
	props: {
		modelValue: {
			type: Object as PropType<PDG>,
			required: true,
		},
		dataType: {
			type: [Object, String] as PropType<DataType>,
		},
	},
	emits: [],
	setup(props) {
		const type = computed(() => {
			switch (props.modelValue.type) {
				case 'value':
					switch (typeof props.modelValue.value) {
						case 'number':
							return 'PDGInputNumber'
						case 'boolean':
							return 'PDGInputBoolean'
					}
					break
				default:
					return 'PDG-input-' + props.modelValue.type
			}
		})

		const isEditingCode = ref(false)

		return {type, isEditingCode}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/common.styl'

.PDGInputExp
	position relative
	margin-bottom 0.3rem

	&__edit-exp
		position absolute
		top 0
		right 0
		height $input-height
		color var(--comment)
		line-height $input-height
</style>
