<template>
	<div class="DialogSettings">
		<div class="DialogSettings__header">
			<div class="DialogSettings__name">Settings</div>
			<button class="DialogSettings__header-button" @click="resetSettings">
				Reset
			</button>
		</div>
		<div class="DialogSettings__editor">
			<GlispEditor v-model="code" />
			<div
				class="DialogSettings__error-indicator"
				:class="{error: hasParseError}"
			>
				{{ hasParseError ? '!' : '✓' }}
			</div>
		</div>
		<div class="DialogSettings__buttons">
			<button class="button" @click="$emit('close')">Cancel</button>
			<button class="button bold" @click="updateSettings">Update</button>
		</div>
	</div>
</template>

<script lang="ts">
import {computed, defineComponent, ref} from 'vue'

import GlispEditor from '@/components/GlispEditor/GlispEditor.vue'
import {readStr} from '@/mal'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const DEFAULT_SETTINGS = require('raw-loader!@/default-settings.glisp')
	.default as string

export default defineComponent({
	name: 'DialogSettings',
	components: {GlispEditor},
	setup() {
		const code = ref(localStorage.getItem('settings') || DEFAULT_SETTINGS)

		const hasParseError = computed(() => {
			const codeStr = code.value
			try {
				readStr(`(do\n${codeStr}\n)`, false)
			} catch (e) {
				return true
			}
			return false
		})

		function resetSettings() {
			code.value = DEFAULT_SETTINGS
		}

		function updateSettings() {
			if (hasParseError.value) {
				alert('Cannot update the settings because of the parsing error.')
				return
			}
			localStorage.setItem('settings', code.value)
			if (
				confirm(
					'Are you sure you want to reload the editor to reflect the settings?'
				)
			) {
				location.reload()
			}
		}

		return {
			code,
			hasParseError,
			resetSettings,
			updateSettings,
		}
	},
})
</script>

<style lang="stylus">
@import '~@/style/common.styl'

.DialogSettings
	position relative
	height 100%
	text-align left
	user-select none
	translucent-bg()

	&__header
		display flex
		margin 2rem 2rem 0.5em

	&__header-button
		labeled-button()

	&__name
		flex-grow 1
		color var(--textcolor)
		font-weight bold
		line-height $button-height

	&__editor
		position relative
		padding 1rem
		height 40vh

	&__error-indicator
		$size = 2.5rem
		position absolute
		right 2rem
		bottom 1rem
		width $size
		height $size
		border 1px solid var(--comment)
		border-radius 50%
		color var(--comment)
		text-align center
		font-monospace()
		line-height 2.2rem
		transition all 0.2s var(--ease)
		--textcolor var(--comment)

		&.error
			border-color var(--error)
			background var(--error)
			color var(--background)
			--textcolor var(--background)

	&__buttons
		display flex
		border-top 1px solid var(--frame)

		.button
			display block
			flex-grow 1
			padding 1rem
			border-right 1px solid var(--frame)
			color var(--comment)

			&:hover
				color var(--highlight)

			&:last-child
				border-right none

			&.bold
				font-weight bold
</style>
