<template>
	<div class="PageRaster">
		<menu class="PageRaster__gmenu">
			<h1 class="PageRaster__gmenu-title">'(GLISP)</h1>
		</menu>
		<Splitpanes class="glisp-theme">
			<Pane class="no-padding PageRaster__viewport">
				<Zoomable
					class="PageRaster__zoomable"
					v-model:transform="viewTransform"
				>
					<img
						class="PageRaster__canvas"
						ref="canvas"
						src="https://fd.baku89.com/assets/default.jpg"
						:style="{
							transform: `matrix(${viewTransform.join(',')})`,
						}"
					/>
				</Zoomable>
			</Pane>
			<Pane class="no-padding PageRaster__control">
				<Tab :tabs="['control', 'shader']" initialTab="control">
					<template #panel-control> </template>
					<template #panel-shader> </template>
				</Tab>
			</Pane>
		</Splitpanes>
	</div>
	<div class="PageRaster__bg" />
</template>

<script lang="ts">
import 'normalize.css'
import 'splitpanes/dist/splitpanes.css'

import {templateRef} from '@vueuse/core'
import {mat2d} from 'gl-matrix'
import {Pane, Splitpanes} from 'splitpanes'
import {defineComponent, ref} from 'vue'

import Tab from '@/components/layouts/Tab.vue'
import useScheme from '@/components/use/use-scheme'

import Zoomable from './Zoomable.vue'

export default defineComponent({
	name: 'PageRaster',
	components: {
		Splitpanes,
		Pane,
		Tab,
		Zoomable,
	},
	setup() {
		useScheme()

		const canvasEl = templateRef('canvas')

		const viewTransform = ref(mat2d.create())

		return {viewTransform}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/global.styl'
@import '~@/components/style/common.styl'

$height = 3.4em

html, body
	overflow hidden

glass-bg()
	background base16('00', 0.9)
	backdrop-filter blur(10px)

.PageRaster
	app()
	height 100vh
	background transparent
	grid-template-rows $height 1fr

	&__bg
		position fixed
		z-index -20
		background base16('00')
		inset 0

	&__gmenu
		position relative
		display flex
		overflow visible
		height $height
		border-bottom 1px solid $color-frame
		glass-bg()
		user-select none

		&-title
			position relative
			overflow hidden
			margin 0 0 0 0.5em
			width $height
			height $height
			background base16('05')
			background-size 100% 100%
			text-align center
			text-indent 10em
			font-weight normal
			font-size 1em
			mask-image url('../../logo.png')
			mask-size 60% 60%
			mask-repeat no-repeat
			mask-position 50% 50%

	&__viewport
		overflow hidden !important

	&__control
		glass-bg()

	&__zoomable
		width 100%
		height 100%

	&__canvas
		position fixed
		z-index -10
		display block
		transform-origin 0 0
		pointer-events none
</style>
