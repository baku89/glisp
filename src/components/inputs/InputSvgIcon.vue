<template>
	<button
		class="InputSvgIcon"
		:class="{opened}"
		@click="opened = true"
		ref="buttonEl"
		v-bind="$attrs"
	>
		<SvgIcon mode="block" class="InputSvgIcon__icon" v-html="modelValue" />
	</button>
	<Popover v-model:open="opened" :reference="buttonEl" placement="bottom">
		<div class="InputSvgIcon__popover-frame">
			<header class="InputSvgIcon__header">
				<SvgIcon class="InputSvgIcon__preview" mode="block" v-html="code" />
				<InputButton label="Copy SVG" @click="copySvg" />
				<InputButton label="Paste SVG" @click="pasteSvg" />
			</header>
			<MonacoEditor class="InputSvgIcon__code" lang="xml" v-model="code" />
		</div>
	</Popover>
</template>

<script lang="ts">
import hotkeys from 'hotkeys-js'
import {defineComponent, inject, onMounted, Ref, ref, watch} from 'vue'

import Popover from '@/components/layouts/Popover.vue'
import SvgIcon from '@/components/layouts/SvgIcon.vue'

import MonacoEditor from '../layouts/MonacoEditor'
import InputButton from './InputButton.vue'

export default defineComponent({
	name: 'InputSvgIcon',
	components: {
		InputButton,
		MonacoEditor,
		Popover,
		SvgIcon,
	},
	props: {
		modelValue: {
			type: String,
			required: true,
		},
	},
	emit: ['update:modelValue'],
	inheritAttrs: false,
	setup(props, context) {
		const buttonEl = ref(null)
		const opened = ref(false)

		const code = ref(props.modelValue)

		watch(
			() => props.modelValue,
			v => (code.value = v)
		)

		watch(
			opened,
			opened => !opened && context.emit('update:modelValue', code.value)
		)

		const scheme = inject<Ref<{[name: string]: string}>>('scheme', ref({}))

		onMounted(() => {
			if (!buttonEl.value) return

			hotkeys('ctrl+c, command+c', {element: buttonEl.value}, copySvg)
			hotkeys('ctrl+v, command+v', {element: buttonEl.value}, () => {
				pasteSvg().then(() => context.emit('update:modelValue', code.value))
			})
		})

		function copySvg() {
			const dom = new DOMParser().parseFromString(
				'<svg>\n' + code.value + '</svg>',
				'image/svg+xml'
			)
			const doc = dom.documentElement
			doc.querySelectorAll('*').forEach(el => el.classList.add('st'))

			const svg = `
				<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 32 32">
				<style type="text/css">
					.frame{fill:${scheme.value.base00};}
					.st{fill:none;stroke:${scheme.value.base05};stroke-width:2;}
				</style>
				<rect class="frame" width="32" height="32"/>
				${doc.innerHTML}
				</svg>`

			navigator.clipboard.writeText(svg)
		}

		async function pasteSvg() {
			const svg = await navigator.clipboard.readText()
			const dom = new DOMParser().parseFromString(svg, 'image/svg+xml')
			const doc = dom.documentElement

			// Cleanup
			doc.querySelectorAll('defs, style').forEach(el => el.remove())
			doc.querySelectorAll('*').forEach(el => {
				el.removeAttribute('class')
				el.removeAttribute('xmlns')
			})

			// Delete the first frame
			dom.querySelector('rect')?.remove()

			code.value = doc.innerHTML
				.trim()
				.replaceAll(' xmlns="http://www.w3.org/2000/svg"', '')
		}

		return {buttonEl, opened, code, copySvg, pasteSvg}
	},
})
</script>

<style lang="stylus">
@import '../style/common.styl'

.InputSvgIcon
	position relative
	width $input-height
	height $input-height
	border-radius $input-round
	input-transition(background)
	color base16('05')

	&:focus
		background base16('01')

	&:hover, &.opened
		background base16('accent', 0.5)

	&__icon
		margin $subcontrol-margin
		width $subcontrol-height
		height $subcontrol-height
		border-radius $input-round

	&__popover-frame
		margin 0.5em
		padding 1em
		width 40em
		border 1px solid $color-frame
		border-radius $popup-round
		translucent-bg()
		position relative
		box-shadow 0 0 20px 0 base16('00', 0.9)

	&__header
		display flex
		align-items center
		margin-bottom 1em
		gap 1em

	&__preview
		width 8em
		height 8em
		border 1px solid base16('01')
		background-image linear-gradient(transparent 0, transparent 95%, base16('01') 95%, base16('01') 100%), linear-gradient(90deg, transparent 0, transparent 95%, base16('01') 95%, base16('01') 100%)
		background-size 2em 2em
		backgrond-repeat repeat

	&__code
		height 10em
</style>
