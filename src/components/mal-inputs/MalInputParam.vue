<template>
	<div class="MalInputParam">
		<div class="MalInputParam__param" v-for="(scheme, i) in schemes" :key="i">
			<div class="MalInputParam__label" v-if="scheme.label">
				{{ scheme.label }}
			</div>
			<component
				class="MalInputParam__input"
				:is="scheme.type"
				:value="params[i]"
				:compact="true"
				@input="updateParamAt($event, i)"
				@end-tweak="$emit('end-tweak')"
			/>
		</div>
	</div>
</template>

<script lang="ts">
import {defineComponent, computed, PropType} from 'vue'
import MalInputNumber from '@/components/mal-inputs/MalInputNumber.vue'
import MalInputColor from '@/components/mal-inputs/MalInputColor.vue'
import {
	MalSeq,
	getEvaluated,
	MalType,
	getMeta,
	MalVal,
	cloneExp,
	MalList.isType(,
} from '@/mal/types'
import {getMapValue} from '@/mal/utils'
import {convertMalNodeToJSObject} from '@/mal/reader'

export default defineComponent({
	name: 'MalInputParam',
	components: {
		number: MalInputNumber,
		color: MalInputColor,
	},
	props: {
		value: {
			type: Object as PropType<MalSeq>,
			required: true,
		},
	},
	setup(props, context) {
		const params = computed(() => {
			return props.value.slice(1)
		})

		const fn = computed(() => getEvaluated(props.value[0]))

		const schemes = computed(
			() =>
				convertMalNodeToJSObject(
					getMapValue(getMeta(fn.value), 'compact-params', MalType.Vector)
				) || null
		)

		function updateParamAt(value: MalVal, i: number) {
			const newExp = cloneExp(props.value)
			newExp[i + 1] = value

			context.emit('input', newExp)
		}

		return {params, schemes, updateParamAt}
	},
})
</script>

<style lang="stylus">
@import '../style/common.styl'

.MalInputParam
	display flex
	align-items center
	line-height $input-height

	&__param
		display flex
		align-items center

	&__label
		margin-right 0.4rem

	&__input
		margin-right 0.6rem
</style>
