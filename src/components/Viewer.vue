<template>
	<div class="Viewer" v-click-outside="onClickOutside">
		<div class="Viewer__hud">
			<div class="Viewer__buttons">
				<label class="Viewer__label">🖋</label>
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
			<div class="Viewer__buttons">
				<label class="Viewer__label">✍️</label>
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
		<canvas
			class="Viewer__canvas"
			ref="canvas"
			@mousedown="onMouse"
			@mouseup="onMouse"
			@mousemove="onMouse"
			@mouseenter="cursorVisible = true"
			@mouseleave="cursorVisible = false"
		/>
		<div class="Viewer__cursor-wrapper">
			<div class="Viewer__cursor" :style="cursorStyle" />
		</div>
	</div>
</template>

<script lang="ts">
import {Component, Prop, Vue, Watch} from 'vue-property-decorator'
import ClickOutside from 'vue-click-outside'

import {replEnv, PRINT, EVAL} from '@/impl/repl'
import {viewREP, consoleREP, consoleEnv} from '@/impl/view'
import Env from '@/impl/env'

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

	private rep!: (s: string) => Env
	private viewEnv!: Env
	private rafID!: number

	private mounted() {
		const ctx = (this.$refs.canvas as HTMLCanvasElement).getContext('2d')

		if (ctx) {
			const dpi = window.devicePixelRatio || 1

			this.rep = (str: string) => viewREP(str, ctx)

			const updateCanvasRes = () => {
				const canvas = ctx.canvas

				ctx.canvas.width = canvas.clientWidth * dpi
				ctx.canvas.height = canvas.clientHeight * dpi

				this.update()
			}

			window.addEventListener('resize', updateCanvasRes)

			updateCanvasRes()
		}
	}

	@Watch('code')
	private update() {
		const trimmed = this.code
			.split('\n')
			.map(s => s.replace(/;.*$/, '').trim())
			.join('')
		const str = trimmed ? `(do ${this.code})` : '""'
		this.viewEnv = this.rep(`(def $view ${str}\n)`)

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

	private togglePen(pen: string) {
		if (this.activePen === pen) {
			this.activePen = null
			cancelAnimationFrame(this.rafID)
		} else {
			// Begin
			this.activePen = pen
			EVAL([S('begin-draw'), S('state')], consoleEnv)
			this.rafID = requestAnimationFrame(this.onFrame)
		}
	}

	private onFrame() {
		if (this.activePen === null) return

		console.log('framee')

		const [x, y] = this.cursorPos
		const p = this.mousePressed

		EVAL(
			[
				S('if'),
				[S('draw'), S(this.activePen), S('state'), [S('quote'), [x, y, p]]],
				[S('$insert'), [S('first'), S('state')]]
			],
			consoleEnv
		)

		this.rafID = requestAnimationFrame(this.onFrame)
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

		const rem = parseFloat(getComputedStyle(document.documentElement).fontSize)
		const margin = rem * 2

		let x = pageX - margin,
			y = pageY - margin,
			p = this.mousePressed

		if (this.activeHand !== null && this.viewEnv.hasOwn(this.activeHand)) {
			;[x, y, p] = EVAL([S(this.activeHand), x, y, p], consoleEnv) as [
				number,
				number,
				boolean
			]
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

	&__label
		font-size 1.5rem
		padding-top .2rem
		margin-right .2rem
		filter grayscale(1)
		// background white

	&__button
		margin 0 0.3rem
		line-height 1.2rem
		padding .4rem .7rem
		border 1px solid var(--comment)
		border-radius 1rem
		background 0
		background var(--background)
		color var(--foreground)
		transition all var(--tdur) ease
		outliine none

		&.active
			color var(--background)
			background var(--comment)
			transition all 0 ease


	&__canvas
		width 100%
		height 100%

	&__cursor-wrapper
		position absolute
		top 2rem
		left 2rem
		background blue
		pointer-events none

	&__cursor
		position absolute
		width 2rem
		height @width
		margin @width * -.5
		border-radius 50%

		&:before, &:after
			content ''
			position absolute
			display block
			background red

		&:before
			width 1px
			height 100%
			left 50%

		&:after
			width 100%
			height 1px
			top 50%
</style>
