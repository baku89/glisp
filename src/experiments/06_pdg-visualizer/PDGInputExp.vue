<template>
	<div class="PDGInputExp">
		<component
			v-if="!isEditingCode"
			:is="type"
			:modelValue="modelValue"
			@update:modelValue="$emit('update:modelValue', $event)"
		/>
		<InputString v-else :multiline="true" v-model="code" />
		<button class="PDGInputExp__edit-exp" @click="toggleEdit">
			{{ isEditingCode ? 'Update' : 'Edit' }}
		</button>
	</div>
</template>

<script lang="ts">
import {computed, defineComponent, PropType, ref, toRaw} from 'vue'

import InputString from '@/components/inputs/InputString.vue'

import PDGInputBoolean from './PDGInputBoolean.vue'
import PDGInputFncall from './PDGInputFncall.vue'
import PDGInputGraph from './PDGInputGraph.vue'
import PDGInputNumber from './PDGInputNumber.vue'
import PDGInputSymbol from './PDGInputSymbol.vue'
import {deleteAllDups, PDG, printPDG, readAST, readStr, setDirty} from './repl'

export default defineComponent({
	name: 'PDGInputExp',
	components: {
		PDGInputNumber,
		PDGInputBoolean,
		PDGInputFncall,
		PDGInputGraph,
		PDGInputSymbol,
		InputString,
	},
	props: {
		modelValue: {
			type: Object as PropType<PDG>,
			required: true,
		},
	},
	emits: ['update:modelValue'],
	setup(props, context) {
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

		const code = ref('')

		function toggleEdit() {
			isEditingCode.value = !isEditingCode.value

			if (isEditingCode.value) {
				// Start edit
				code.value = printPDG(props.modelValue)
			} else {
				// On end
				try {
					const newValue = readAST(readStr(code.value))

					const oldValue = toRaw(props.modelValue)
					setDirty(oldValue)

					deleteAllDups(oldValue)

					context.emit('update:modelValue', newValue)
				} catch {
					null
				}
			}
		}

		return {type, isEditingCode, code, toggleEdit}
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
		line-height $input-height
</style>
