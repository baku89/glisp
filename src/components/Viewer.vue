<template>
	<canvas class="Viewer" ref="canvas" />
</template>

<script lang="ts">
import {Component, Prop, Vue, Watch} from 'vue-property-decorator'
import {replEnv, PRINT} from '@/impl/repl'
import {createViewportRep} from '@/impl/viewport'
import Env, {EnvData} from '../impl/env'

@Component
export default class Viewer extends Vue {
	private envData: EnvData = replEnv.data

	private ctx!: CanvasRenderingContext2D
	private rep!: any

	private mounted() {
		const ctx = (this.$refs.canvas as HTMLCanvasElement).getContext('2d')
		if (ctx) {
			const canvas = ctx.canvas
			ctx.canvas.width = canvas.clientWidth
			ctx.canvas.height = canvas.clientHeight

			this.ctx = ctx
			;(window as any)['ctx'] = ctx

			this.rep = createViewportRep(ctx)

			this.onWorldChanged()
		}
	}

	@Watch('envData.$')
	private onWorldChanged() {
		const str = PRINT(replEnv.get('$'))
		this.rep(str)
	}
}
</script>

<style lang="stylus" scoped>
.Viewer
	height 100%
	background #eee
</style>
