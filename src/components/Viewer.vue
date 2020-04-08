<template>
	<canvas
		class="Viewer"
		ref="canvas"
		@mousedown="onMousedown"
		@mouseup="onMouseup"
		@mousemove="onMousemove"
	/>
</template>

<script lang="ts">
import {Component, Prop, Vue, Watch} from 'vue-property-decorator'
import {replEnv, PRINT} from '@/impl/repl'
import {createViewREP} from '@/impl/view'

@Component
export default class Viewer extends Vue {
	@Prop({type: Number, required: true}) private timestamp!: string

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

	private onMousemove() {
		null
	}

	private onMouseup() {
		null
	}

	private onMousedown() {
		null
	}
}
</script>

<style lang="stylus" scoped>
.Viewer
	height 100%
	background #eee
</style>
