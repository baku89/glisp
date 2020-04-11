<template>
	<div class="Viewer" v-click-outside="onClickOutside">
		<div class="Viewer__buttons Viewer__tools">
			<button
				class="Viewer__button"
				:class="{active: tool === activeTool}"
				v-for="(tool, i) in tools"
				:key="i"
				@click="toggleTool(tool)"
			>
				{{ tool }}
			</button>
		</div>
		<div class="Viewer__buttons Viewer__hands">
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
				Normal
			</button>
		</div>
		<canvas
			class="Viewer__canvas"
			ref="canvas"
			@mousedown="onMouse"
			@mouseup="onMouse"
			@mousemove="onMouse"
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

	private activeTool: string | null = null
	private tools: string[] = []

	private activeHand: string | null = null
	private hands: string[] = []
	private cursorStyle = {left: '0px', top: '0px'}

	private mousePressed = false

	private rep!: (s: string) => Env
	private viewEnv!: Env

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
		const str = replEnv.get('$canvas') as string
		this.viewEnv = this.rep(`(do ${str})`)

		this.tools = ((this.viewEnv.get('$tools') as symbol[]) || []).map(
			(sym: symbol) => Symbol.keyFor(sym) || ''
		)

		this.hands = ((this.viewEnv.get('$hands') as symbol[]) || []).map(
			(sym: symbol) => Symbol.keyFor(sym) || ''
		)

		if (this.activeTool && !this.tools.includes(this.activeTool)) {
			this.activeTool = null
		}
	}

	private toggleTool(tool: string) {
		if (this.activeTool === tool) {
			this.activeTool = null
		} else {
			// Begin
			this.activeTool = tool
			consoleREP(`(begin-draw! state)`)
		}
	}

	private onClickOutside() {
		this.activeTool = null
	}

	private onMouse(e: MouseEvent) {
		const {type, offsetX, offsetY} = e

		if (type === 'mousedown') {
			this.mousePressed = true
		} else if (type === 'mouseup') {
			this.mousePressed = false
		}

		const rem = parseFloat(getComputedStyle(document.documentElement).fontSize)
		const margin = rem * 2

		let x = offsetX - margin,
			y = offsetY - margin,
			p = this.mousePressed

		if (this.activeHand !== null && this.viewEnv.hasOwn(this.activeHand)) {
			;[x, y, p] = EVAL([S(this.activeHand), x, y, p], consoleEnv) as [
				number,
				number,
				boolean
			]
		}

		this.cursorStyle.left = x + 'px'
		this.cursorStyle.top = y + 'px'

		if (this.activeTool) {
			consoleREP(
				`
				(if
					(draw! ${this.activeTool} state '(${x} ${y} ${p}))
					($insert (first state)))
			`,
				false
			)
		}
	}
}
</script>

<style lang="stylus" scoped>
.Viewer
	position relative
	height 100%

	&__tools
		top 1rem

	&__hands
		top 4rem

	&__buttons
		position absolute
		right 1rem

	&__button
		margin 0 0.5rem
		padding 0.5rem 1rem
		border 1px solid var(--comment)
		border-radius 1.5rem
		background 0
		background var(--background)
		color var(--foreground)
		transition all var(--tdur) ease
		outliine none

		&.active
			box-shadow 0 0 0 3px var(--background), 0 0 0 4px var(--comment)

	&__canvas
		height 100%

	&__cursor-wrapper
		position absolute
		top 2rem
		left 2rem
		background blue
		pointer-events none

	&__cursor
		position absolute
		width 10px
		height 10px
		background green
</style>
