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
import {defineComponent, computed, SetupContext} from '@vue/composition-api'
import MalInputNumber from '@/components/mal-input/MalInputNumber.vue'
import MalInputColor from '@/components/mal-input/MalInputColor.vue'
import {
	MalSeq,
	getEvaluated,
	MalType,
	getMeta,
	MalVal,
	cloneExp,
	isList,
} from '@/mal/types'
import {getMapValue} from '@/mal/utils'
import {convertMalNodeToJSObject} from '@/mal/reader'
import {NonReactive, nonReactive} from '@/utils'

interface Props {
	value: NonReactive<MalSeq>
}

export default defineComponent({
	name: 'MalInputParam',
	components: {
		number: MalInputNumber,
		color: MalInputColor,
	},
	props: {
		value: {
			required: true,
			validator: v => v instanceof NonReactive && isList(v.value),
		},
	},
	setup(props: Props, context: SetupContext) {
		const params = computed(() => {
			return props.value.value.slice(1).map(nonReactive)
		})

		const fn = computed(() => getEvaluated(props.value.value[0]))

		const schemes = computed(
			() =>
				convertMalNodeToJSObject(
					getMapValue(getMeta(fn.value), 'compact-params', MalType.Vector)
				) || null
		)

		function updateParamAt(value: NonReactive<MalVal>, i: number) {
			const newExp = cloneExp(props.value.value)
			newExp[i + 1] = value.value

			context.emit('input', nonReactive(newExp))
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
