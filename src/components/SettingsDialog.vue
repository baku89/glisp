<template>
	<div class="SettingsDialog">
		<div class="SettingsDialog__editor">
			<GlispEditor :value="code" />
			<div
				class="SettingsDialog__error-indicator"
				:class="{error: hasParseError}"
			>{{ hasParseError ? '!' : '✓' }}</div>
		</div>
		<div class="SettingsDialog__buttons">
			<button class="button" @click="$emit('close')">Cancel</button>
			<button class="button" @click="resetSettings">Reset</button>
			<button class="button bold" @click="updateSettings">Update</button>
		</div>
	</div>
</template>

<script lang="ts">
import Vue from 'vue'
import {defineComponent, ref, computed} from '@vue/composition-api'
import {readStr} from '@/mal'
import GlispEditor from '@/components/GlispEditor/GlispEditor2.vue'

export default defineComponent({
	name: 'SettingsDialog',
	components: {GlispEditor},
	props: {
		code: {
			type: String,
			required: true,
		},
	},
	setup(props) {
		const hasParseError = computed(() => {
			const codeStr = props.code
			try {
				readStr(`(do\n${codeStr}\n)`, false)
			} catch (e) {
				return true
			}
			return false
		})

		function resetSettings() {
			// code.value = DEFAULT_SETTINGS
			updateSettings()
		}

		function updateSettings() {
			if (hasParseError.value) {
				alert('Cannot update the settings because of the parsing error.')
				return
			}
			localStorage.setItem('settings', props.code)
			if (
				confirm(
					'Are you sure you want to reload the editor to reflect the settings?'
				)
			) {
				location.reload()
			}
		}

		return {
			hasParseError,
			resetSettings,
			updateSettings,
		}
	},
})
</script>

<style lang="stylus">
@import './style/common.styl'

.SettingsDialog
	position relative
	height 100%
	text-align left
	user-select none
	translucent-bg()

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
		border-radius 50%
		--textcolor var(--comment)
		font-monospace()
		border 1px solid var(--comment)
		color var(--comment)
		text-align center
		line-height 2.2rem

		&.error
			border-color var(--warning)
			background var(--warning)
			color var(--background)
			--textcolor var(--background)

	&__buttons
		display flex
		border-top 1px solid var(--border)

		.button
			display block
			flex-grow 1
			padding 1rem
			border-right 1px solid var(--border)
			color var(--comment)

			&:hover
				color var(--highlight)

			&:last-child
				border-right none

			&.bold
				font-weight bold
</style>
