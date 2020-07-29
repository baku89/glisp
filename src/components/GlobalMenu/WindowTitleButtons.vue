<template>
	<div class="WindowTitleButtons">
		<button class="min" @click="onClickMin">
			<svg width="11" height="1" viewBox="0 0 11 1">
				<path d="m11 0v1h-11v-1z" stroke-width=".26208" />
			</svg>
		</button>
		<button class="max" @click="onClickMax" v-if="!maximized">
			<svg width="10" height="10" viewBox="0 0 10 10">
				<path
					d="m10-1.6667e-6v10h-10v-10zm-1.001 1.001h-7.998v7.998h7.998z"
					stroke-width=".25"
				/>
			</svg>
		</button>
		<button class="restore" @click="onClickRestore" v-else>
			<svg width="11" height="11" viewBox="0 0 11 11">
				<path
					d="m11 8.7978h-2.2021v2.2022h-8.7979v-8.7978h2.2021v-2.2022h8.7979zm-3.2979-5.5h-6.6012v6.6011h6.6012zm2.1968-2.1968h-6.6012v1.1011h5.5v5.5h1.1011z"
					stroke-width=".275"
				/>
			</svg>
		</button>
		<button class="close" @click="onClickClose">
			<svg width="12" height="12" viewBox="0 0 12 12">
				<path
					d="m6.8496 6 5.1504 5.1504-0.84961 0.84961-5.1504-5.1504-5.1504 5.1504-0.84961-0.84961 5.1504-5.1504-5.1504-5.1504 0.84961-0.84961 5.1504 5.1504 5.1504-5.1504 0.84961 0.84961z"
					stroke-width=".3"
				/>
			</svg>
		</button>
	</div>
</template>

<script lang="ts">
import {defineComponent, ref} from '@vue/composition-api'

export default defineComponent({
	name: 'WindowTitleButtons',
	props: {
		dark: {
			type: Boolean,
			required: true,
		},
	},
	setup() {
		const {remote} = eval("require('electron')") as {
			remote: Electron.Remote
		}

		const win = remote.getCurrentWindow()

		function onClickMin() {
			win.minimize()
		}

		function onClickMax() {
			win.maximize()
		}

		function onClickRestore() {
			win.unmaximize()
		}

		function onClickClose() {
			win.close()
		}

		const maximized = ref(win.isMaximized())

		function onToggleMaxRestoreButtons() {
			maximized.value = win.isMaximized()
		}

		win.on('maximize', onToggleMaxRestoreButtons)
		win.on('unmaximize', onToggleMaxRestoreButtons)

		window.onbeforeunload = () => {
			win.removeAllListeners()
		}

		return {onClickMin, onClickMax, onClickRestore, onClickClose, maximized}
	},
})
</script>

<style lang="stylus" scoped>
// Window Button (Windows only)
.WindowTitleButtons
	display grid
	grid-template-columns: repeat(3, 46px)
	height 100%
	-webkit-app-region: no-drag
	user-select none

	button
		grid-row 1 / span 1
		display flex
		justify-content center
		align-items center
		width 100%
		height 100%

		&:hover
			background var(--border)

		&:active
			background var(--border)

		&.min
			grid-column 1

		&.max, &.restore
			grid-column 2

		&.close
			grid-column 3
			&:hover
				background #E81123 !important
			&:active
				background: #F1707A !important;

	path
		fill var(--foreground)
</style>
