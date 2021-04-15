import {ref} from '@vue/reactivity'
import {computed, watchEffect} from '@vue/runtime-core'

import LightOwl from './builtin-themes/Light Owl.json'
import OceanDarkExtended from './builtin-themes/Ocean Dark Extended.json'

type Theme = typeof OceanDarkExtended & typeof LightOwl

const ThemePresets = {
	'Ocean Dark Extended': OceanDarkExtended as Theme,
	'Light Owl': LightOwl as Theme,
} as {[name: string]: Theme}

export function useTheme() {
	const name = ref('Ocean Dark Extended')

	const theme = computed(() => ThemePresets[name.value])

	// Set css variables to body
	watchEffect(() => {
		const htmlStyle = document.documentElement.style

		for (const [name, color] of Object.entries(theme.value.colors)) {
			if (typeof color !== 'string') continue
			const varName = '--' + name.replaceAll('.', '-')
			htmlStyle.setProperty(varName, color)
		}

		for (const token of theme.value.tokenColors) {
			if (typeof token.scope !== 'string') continue
			const varName = '--' + token.scope.replaceAll('.', '-')
			htmlStyle.setProperty(varName, token.settings.foreground)
		}
	})

	return {name}
}
