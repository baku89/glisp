<template>
	<div class="Viewer">
		<div class="Viewer__tools">
			<button @click="togglePencil">Toggle Pencil</button>
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
import {replEnv, PRINT} from '@/impl/repl'
import {createViewREP, consoleREP} from '@/impl/view'

@Component
export default class Viewer extends Vue {
	@Prop({type: Number, required: true}) private timestamp!: string

	private tool: string | null = null
	private mousePressed = false

	private rep!: any

	private mounted() {
		const ctx = (this.$refs.canvas as HTMLCanvasElement).getContext('2d')
		if (ctx) {
			const canvas = ctx.canvas
			ctx.canvas.width = canvas.clientWidth
			ctx.canvas.height = canvas.clientHeight
			;(window as any)['ctx'] = ctx

			this.rep = createViewREP(ctx)

			this.update()
		}
	}

	@Watch('timestamp')
	private update() {
		const str = replEnv.get('$') as string
		this.rep(`(do ${str})`)
	}

	private togglePencil() {
		this.tool = this.tool ? null : 'pencil'

		if (this.tool === 'pencil') {
			consoleREP("(def! state '())")
		}
	}

	private onMouse(e: MouseEvent) {
		if (this.tool === 'pencil') {
			const {type, offsetX, offsetY} = e

			if (type === 'mousedown') {
				this.mousePressed = true
			} else if (type === 'mouseup') {
				this.mousePressed = false
			}

			const x = offsetX,
				y = offsetY,
				p = this.mousePressed

			consoleREP(`(def! state (pencil state '(${x} ${y} ${p})))`)
			consoleREP('($insert `(quote ~(first state)))')
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

	&__canvas
		height 100%
		background #eee
</style>
