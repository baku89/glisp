<template>
	<div class="Viewer" v-click-outside="onClickOutside">
		<div class="Viewer__hud">
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
		</div>
		<canvas class="Viewer__canvas" ref="canvas" />
		<div
			class="Viewer__cursor-wrapper"
			@mousedown="onMouse"
			@mouseup="onMouse"
			@mousemove="onMouse"
			@mouseenter="cursorVisible = true"
			@mouseleave="cursorVisible = false"
		>
			<div class="Viewer__cursor" :style="cursorStyle" />
		</div>
	</div>
</template>

<script lang="ts">
import {Component, Prop, Vue, Watch} from 'vue-property-decorator'
import ClickOutside from 'vue-click-outside'

import {replEnv, PRINT, EVAL, READ} from '@/mal/repl'
import {viewREP, consoleREP, consoleEnv, viewHandler} from '@/mal/view'
import Env from '@/mal/env'

import Worker from 'worker-loader!../worker'

const S = Symbol.for

@Component({
	directives: {ClickOutside}
})
export default class Viewer extends Vue {
	@Prop({type: String, required: true}) private code!: string

	private activePen: string | null = null
	private pens: string[] = []

	private activeHand: string | null = null
	private hands: string[] = []

	private cursorVisible = false
	private cursorPos = [0, 0]

	private get cursorStyle() {
		return {
			left: this.cursorPos[0] + 'px',
			top: this.cursorPos[1] + 'px',
			visibility: this.cursorVisible ? 'visible' : 'hidden'
		}
	}

	private mousePressed = false

	private viewEnv!: Env
	private timerID!: number
	private rendering!: boolean

	private worker!: any
	private canvas!: HTMLCanvasElement

	private mounted() {
		this.canvas = this.$refs.canvas as HTMLCanvasElement
		const offscreenCanvas = this.canvas.transferControlToOffscreen()

		this.worker = new Worker() as ServiceWorker
		this.worker.onmessage = this.onRendererMessage
		this.worker.postMessage(
			{
				type: 'init',
				params: {canvas: offscreenCanvas}
			},
			[offscreenCanvas] as Transferable[]
		)

		this.onResize()
		window.addEventListener('resize', this.onResize)
	}

	private beforeDestroy() {
		window.removeEventListener('resize', this.onResize)
		this.worker.terminate()
	}

	private onResize() {
		const dpi = window.devicePixelRatio || 1
		const width = this.canvas.clientWidth
		const height = this.canvas.clientHeight

		this.worker.postMessage({type: 'resize', params: {width, height, dpi}})

		// Avoid to update the first time this func called by mount()
		if (this.rendering !== undefined) {
			this.update()
		}
	}

	private onRendererMessage(e) {
		const {type, params} = e.data

		switch (type) {
			case 'enable-animation': {
				const {fps} = params
				const trigger = () => {
					if (this.rendering) {
						requestAnimationFrame(trigger)
					} else {
						this.update()
					}
				}
				requestAnimationFrame(this.update)

				// this.timerID = setTimeout(this.update, 1000 / fps)
				break
			}
			case 'render': {
				this.rendering = false
			}
		}
	}

	@Watch('code')
	private onCodeChanged() {
		this.update()

		if (this.viewEnv) {
			this.pens = ((this.viewEnv.get('$pens') as symbol[]) || []).map(
				(sym: symbol) => Symbol.keyFor(sym) || ''
			)

			this.hands = ((this.viewEnv.get('$hands') as symbol[]) || []).map(
				(sym: symbol) => Symbol.keyFor(sym) || ''
			)

			if (this.activePen && !this.pens.includes(this.activePen)) {
				this.activePen = null
			}
		}
	}

	private update() {
		// clearTimeout(this.timerID)

		const lines = this.code.split('\n').map(s => s.replace(/;.*$/, '').trim())
		const trimmed = lines.join('')

		const str = trimmed
			? `
			(def $view
				(eval-sketch ${lines.join('\n')}))`
			: '""'

		const ret = viewREP(str, this.canvas)

		if (ret) {
			const ast = ret.data.$view
			this.viewEnv = ret

			const id = Date.now()
			this.rendering = true
			this.worker.postMessage({type: 'render', params: {ast}})
		}

		this.$emit('render', !!ret)
	}

	private togglePen(pen: string) {
		if (this.activePen === pen) {
			this.activePen = null
		} else {
			// Begin
			this.activePen = pen
			EVAL([S('begin-draw'), S('state')], consoleEnv)
		}
	}

	private onClickOutside() {
		this.activePen = null
	}

	private onMouse(e: MouseEvent) {
		const {type, pageX, pageY} = e

		if (type === 'mousedown') {
			this.mousePressed = true
		} else if (type === 'mouseup') {
			this.mousePressed = false
		}

		let x = pageX,
			y = pageY,
			p = this.mousePressed

		if (this.activeHand !== null && this.viewEnv.hasOwn(this.activeHand)) {
			;[x, y, p] = EVAL([S(this.activeHand), x, y, p], consoleEnv) as [
				number,
				number,
				boolean
			]
		}

		if (this.activePen !== null) {
			EVAL(
				[
					S('if'),
					[S('draw'), S(this.activePen), S('state'), [S('quote'), [x, y, p]]],
					[S('$insert'), [S('first'), S('state')]]
				],
				consoleEnv
			)
		}

		this.cursorPos = [x, y]
	}
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
		// background green

	&__label
		margin-right 0.2rem
		padding-top 0.2rem
		color var(--comment)
		font-size 2rem
		line-height 1.8rem
		// background white

	&__button
		margin 0 0.3rem
		padding 0.4rem 0.7rem
		border 1px solid var(--comment)
		border-radius 1rem
		background 0
		background var(--background)
		color var(--foreground)
		line-height 1.1rem
		transition all var(--tdur) var(--ease)
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
