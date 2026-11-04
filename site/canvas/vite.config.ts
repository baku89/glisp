import { fileURLToPath } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import glsl from 'vite-plugin-glsl'

const source = (name: string) =>
	fileURLToPath(new URL(`../../dev_modules/${name}/src$1`, import.meta.url))

export default defineConfig({
	base: '/canvas/',
	plugins: [vue(), glsl()],
	resolve: {
		// Tweeq, pave and geome are used from source, as submodules. Without dedupe
		// there would be two copies of Tweeq's stores' pinia and of vue.
		dedupe: ['vue', 'pinia', '@vueuse/core', 'linearly'],
		alias: [
			{ find: /^tweeq(\/.*)?$/, replacement: source('tweeq') },
			{ find: /^pave(\/.*)?$/, replacement: source('pave') },
			{ find: /^geome(\/.*)?$/, replacement: source('geome') },
		],
	},
})
