<template>
	<!-- <div class="Viewer" v-click-outside="onClickOutside"> -->
	<div class="Viewer">
		<!-- <div class="Viewer__hud">
			<div class="Viewer__buttons" v-if="pens.length > 0">
				<label class="Viewer__label">✎</label>
				<button
					class="Viewer__button"
					:class="{active: pen === activePen}"
					v-for="(pen, i) in pens"
					:key="i"
					@click="togglePen(pen)"
				>
					{{ pen }}
				</button>
			</div>
			<div class="Viewer__buttons" v-if="hands.length > 0">
				<label class="Viewer__label">🖑</label>
				<button
					class="Viewer__button"
					:class="{active: hand === activeHand}"
					v-for="(hand, i) in hands"
					:key="i"
					@click="activeHand = hand"
				>
					{{ hand }}
				</button>
				<button
					class="Viewer__button"
					:class="{active: activeHand === null}"
					@click="activeHand = null"
				>
					*
				</button>
			</div>
		</div>-->
		<canvas class="Viewer__canvas" ref="canvas" />
		<!-- <div
			class="Viewer__cursor-wrapper"
			@mousedown="onMouse"
			@mouseup="onMouse"
			@mousemove="onMouse"
			@mouseenter="cursorVisible = true"
			@mouseleave="cursorVisible = false"
		>-->
		<div class="Viewer__cursor-wrapper">
			<!-- <div class="Viewer__cursor" :style="cursorStyle" /> -->
			<ResizeObserver @notify="onResize" />
		</div>
	</div>
</template>

<script lang="ts">
import {Component, Prop, Vue, Watch} from 'vue-property-decorator'
import ClickOutside from 'vue-click-outside'
import 'vue-resize/dist/vue-resize.css'
import {ResizeObserver} from 'vue-resize'

import {evalExp, readEvalStr} from '@/mal'
import {viewREP} from '@/mal/view'
import {symbolFor as S, MalVal, LispError} from '@/mal/types'
import {consoleEnv} from '@/mal/console'
import Env from '@/mal/env'
import {printer} from '@/mal/printer'
import {NonReactive} from '@/utils'
import createCanvasRender, {CanvasRendererType} from '@/renderer/CanvasRenderer'

@Component({
	directives: {ClickOutside},
	components: {ResizeObserver}
})
export default class Viewer extends Vue {
	@Prop({required: true}) private exp!: NonReactive<MalVal> | null
	@Prop({required: true}) private guideColor!: string

	// private activePen: string | null = null
	// private pens: string[] = []

	// private activeHand: string | null = null
	// private hands: string[] = []

	// private cursorVisible = false
	// private cursorPos = [0, 0]
	// private mousePressed = false

	// private get cursorStyle() {
	// 	return {
	// 		left: this.cursorPos[0] + 'px',
	// 		top: this.cursorPos[1] + 'px',
	// 		visibility: this.cursorVisible ? 'visible' : 'hidden'
	// 	}
	// }

	private renderer!: CanvasRendererType //CanvasRendererDelegate
	private canvas!: HTMLCanvasElement

	private async mounted() {
		this.canvas = this.$refs.canvas as HTMLCanvasElement
		this.renderer = await createCanvasRender(this.canvas)

		await this.onResize()
		this.onExpUpdated()
	}

	private beforeDestroy() {
		// this.renderer.dispose()
	}

	private async onResize() {
		const width = this.$el.clientWidth
		const height = this.$el.clientHeight
		const dpi = window.devicePixelRatio || 1
		await this.renderer.resize(width, height, dpi)

		this.$emit('resize', [this.$el.clientWidth, this.$el.clientHeight])

		// this.renderer.resize()
		// this.update()
	}

	@Watch('exp', {deep: false})
	private async onExpUpdated() {
		if (!this.exp || !this.renderer) {
			return
		}
		try {
			const exp = this.exp.value
			const sidefxs: any = await this.renderer.render(exp, {
				guideColor: this.guideColor
			})

			for (const [cmd, params] of sidefxs) {
				switch (cmd) {
					case 'set-background':
						this.$emit('set-background', params)
						break
					// case 'enable-animation': {
					// 	const check = () => {
					// 		this.renderer.isRendering
					// 			? requestAnimationFrame(check)
					// 			: this.update()
					// 	}
					// 	requestAnimationFrame(check)
					// 	break
					// }
				}
			}
		} catch (err) {
			if (err instanceof LispError) {
				printer.error(err.message)
			} else {
				printer.error(err)
			}
			this.$emit('render', false)
			return
		}
		this.$emit('render', true)

		// if (this.viewEnv) {
		// 	this.pens = ((this.viewEnv.get(S('$pens')) as string[]) || []).map(
		// 		sym => sym.slice(1) || ''
		// 	)

		// 	this.hands = ((this.viewEnv.get(S('$hands')) as string[]) || []).map(
		// 		sym => sym.slice(1) || ''
		// 	)

		// 	if (this.activePen && !this.pens.includes(this.activePen)) {
		// 		this.activePen = null
		// 	}
		// }
	}

	// private togglePen(pen: string) {
	// 	if (this.activePen === pen) {
	// 		this.activePen = null
	// 	} else {
	// 		// Begin
	// 		this.activePen = pen
	// 		readEvalStr('(begin-draw state)', consoleEnv)
	// 	}
	// }

	// private onClickOutside() {
	// 	this.activePen = null
	// }

	// private onMouse(e: MouseEvent) {
	// 	const {type, pageX, pageY} = e

	// 	if (type === 'mousedown') {
	// 		this.mousePressed = true
	// 	} else if (type === 'mouseup') {
	// 		this.mousePressed = false
	// 	}

	// 	let x = pageX,
	// 		y = pageY,
	// 		p = this.mousePressed

	// 	if (this.activeHand !== null && this.viewEnv.hasOwn(this.activeHand)) {
	// 		;[x, y, p] = evalExp([S(this.activeHand), x, y, p], consoleEnv) as [
	// 			number,
	// 			number,
	// 			boolean
	// 		]
	// 	}

	// 	if (this.activePen !== null) {
	// 		evalExp(
	// 			[
	// 				S('if'),
	// 				[S('draw'), S(this.activePen), S('state'), [S('quote'), [x, y, p]]],
	// 				[S('insert-exp'), [S('first'), S('state')]]
	// 			],
	// 			consoleEnv
	// 		)
	// 	}

	// 	this.cursorPos = [x, y]
	// }
}
</script>

<style lang="stylus" scoped>
.Viewer
	position relative
	height 100%

	&__hud
		position absolute
		bottom 1rem
		left 1rem

	&__buttons
		display flex
		margin-bottom 1rem
		height 2rem

	&__label
		margin-right 0.2rem
		padding-top 0.2rem
		color var(--comment)
		font-size 2rem
		line-height 1.8rem

	&__button
		margin 0 0.3rem
		padding 0.4rem 0.7rem
		border 1px solid var(--comment)
		border-radius 1rem
		background 0
		background var(--background)
		color var(--foreground)
		line-height 1.1rem
		outliine none

		&.active
			background var(--comment)
			color var(--background)
			transition all 0 ease

	&__canvas, &__cursor-wrapper
		width 100%
		height 100%

	&__cursor-wrapper
		position absolute
		top 0
		left 0
		pointer-events none

	&__cursor
		$width = 2rem
		position absolute
		margin $width * -0.5
		width $width
		height @width
		border-radius 50%

		&:before, &:after
			position absolute
			display block
			background var(--foreground)
			content ''

		&:before
			left 50%
			width 1px
			height 100%

		&:after
			top 50%
			width 100%
			height 1px
</style>
