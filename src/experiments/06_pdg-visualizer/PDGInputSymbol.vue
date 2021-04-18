<template>
	<div class="PDGInputSymbol" ref="inputEl">
		<InputString
			class="PDGInputSymbol__input"
			v-model="name"
			@confirm="update()"
			@focus="candidateSymbolsShown = true"
		/>
		<span
			class="PDGInputSymbol__evaluated"
			:class="{error: evaluated === null}"
		>
			{{ evaluated !== null ? '= ' + evaluated : '⚠' }}
		</span>
		<Popover
			v-model:open="candidateSymbolsShown"
			:reference="inputEl"
			placement="bottom-start"
		>
			<div class="PDGInputSymbol__available-symbols">
				<div
					class="symbol"
					v-for="{symbol} of candidateSymbols"
					:key="symbol"
					@click="onClickCandidate(symbol)"
				>
					{{ symbol }}
				</div>
			</div>
		</Popover>
	</div>
</template>

<script lang="ts">
import Fuse from 'fuse.js'
import {
	computed,
	defineComponent,
	PropType,
	ref,
	toRaw,
	toRef,
	watch,
} from 'vue'

import InputString from '@/components/inputs/InputString.vue'
import Popover from '@/components/layouts/Popover.vue'

import {
	DataType,
	getDataType,
	getSymbols,
	isEqualDataType,
	PDGSymbol,
} from './glisp'
import {usePDGEvalauted, useSwapPDG} from './use'

export default defineComponent({
	name: 'PDGInputSymbol',
	components: {InputString, Popover},
	props: {
		modelValue: {
			type: Object as PropType<PDGSymbol>,
			required: true,
		},
		dataType: {
			type: [Object, String] as PropType<DataType>,
		},
	},
	emits: [],
	setup(props) {
		const inputEl = ref<null | HTMLElement>(null)

		const name = ref('')

		watch(
			() => props.modelValue,
			() => (name.value = props.modelValue.name),
			{immediate: true}
		)

		const {evaluated} = usePDGEvalauted(toRef(props, 'modelValue'))

		// Update
		const swapPDG = useSwapPDG()
		function update(v = name.value) {
			const oldValue = toRaw(props.modelValue)
			const newValue = {...oldValue, resolved: undefined, name: v}

			swapPDG(oldValue, newValue)
		}

		// Candidate box
		const candidateSymbolsShown = ref(false)

		const availableSymbols = computed(() => {
			if (!candidateSymbolsShown.value) {
				return []
			}

			let symbols = Object.entries(
				getSymbols(toRaw(props.modelValue))
			).map(([symbol, pdg]) => ({symbol, pdg}))

			if (props.dataType) {
				const dataTypes = props.dataType
				symbols = symbols.filter(({pdg}) => {
					const dt = getDataType(pdg)
					return dt && isEqualDataType(dataTypes, dt)
				})
			}

			return symbols
		})
		const candidateSymbols = computed(() => {
			if (name.value) {
				const ret = new Fuse(availableSymbols.value, {keys: ['symbol']}).search(
					name.value || '*'
				)
				if (ret.length > 0) {
					return ret.map(r => r.item)
				}
			}
			return availableSymbols.value
		})

		function onClickCandidate(v: string) {
			candidateSymbolsShown.value = false
			update(v)
		}

		return {
			name,
			onClickCandidate,
			candidateSymbolsShown,
			update,
			evaluated,
			availableSymbols,
			inputEl,
			candidateSymbols,
		}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/common.styl'

.PDGInputSymbol
	position relative

	&__input
		width 6rem
		color var(--keyword)
		font-monospace()

	&__evaluated
		padding-left 0.5rem
		color base16('03')

		&.error
			color var(--error)

	&__available-symbols
		margin 2px
		min-width 10rem
		width 10rem
		translucent-bg()
		border 1px solid $color-frame
		border-radius $input-round

		& > .symbol
			padding 0 0.4rem
			height $input-height
			line-height $input-height

			&:hover
				background base16('accent')
</style>
