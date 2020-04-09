<template>
	<div class="Viewer" v-click-outside="onClickOutside">
		<div class="Viewer__tools">
			<button
				class="Viewer__tool"
				:class="{active: tool === activeTool}"
				v-for="(tool, i) in tools"
				:key="i"
				@click="toggleTool(tool)"
			>
				{{ tool }}
			</button>
		</div>
		<canvas
			class="Viewer__canvas"
			ref="canvas"
			@mousedown="onMouse"
			@mouseup="onMouse"
			@mousemove="onMouse"
		/>
	</div>
</template>

<script lang="ts">
import {Component, Prop, Vue, Watch} from 'vue-property-decorator'
import ClickOutside from 'vue-click-outside'

import {replEnv, PRINT} from '@/impl/repl'
import {createViewREP, consoleREP} from '@/impl/view'
import Env from '@/impl/env'

@Component({
	directives: {ClickOutside}
})
export default class Viewer extends Vue {
	@Prop({type: Number, required: true}) private timestamp!: string

	private activeTool: string | null = null
	private tools: string[] = []

	private mousePressed = false

	private rep!: (s: string) => Env

	private mounted() {
		const ctx = (this.$refs.canvas as HTMLCanvasElement).getContext('2d')
		if (ctx) {
			const canvas = ctx.canvas
			ctx.canvas.width = canvas.clientWidth
			ctx.canvas.height = canvas.clientHeight
			;(window as any)['ctx'] = ctx

			this.rep = createViewREP(ctx)

			this.update()

			window.addEventListener('resize', () => {
				const canvas = ctx.canvas
				ctx.canvas.width = canvas.clientWidth
				ctx.canvas.height = canvas.clientHeight
				this.update()
			})
		}
	}

	@Watch('timestamp')
	private update() {
		const str = replEnv.get('$') as string
		const viewEnv = this.rep(`(do ${str})`)

		this.tools = ((viewEnv.get('$tools') as symbol[]) || []).map(
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
		if (this.activeTool) {
			const {type, offsetX, offsetY} = e

			if (type === 'mousedown') {
				this.mousePressed = true
			} else if (type === 'mouseup') {
				this.mousePressed = false
			}

			const x = offsetX,
				y = offsetY,
				p = this.mousePressed

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
		position absolute
		top 0
		right 0

	&__tool
		outliine none
		background 0
		border 1px solid var(--comment)
		padding .5rem 1rem
		margin 0 .5rem
		border-radius 1.5rem
		color var(--foreground)

		transition all var(--tdur) ease

		&.active
			box-shadow 0 0 0 3px var(--background), 0 0 0 4px var(--comment)


	&__canvas
		height 100%
</style>
