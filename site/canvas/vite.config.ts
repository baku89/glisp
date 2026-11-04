import { fileURLToPath } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import glsl from 'vite-plugin-glsl'
import { VitePWA } from 'vite-plugin-pwa'

const source = (name: string) =>
	fileURLToPath(new URL(`../../dev_modules/${name}/src$1`, import.meta.url))

export default defineConfig({
	base: '/canvas/',
	plugins: [
		vue(),
		glsl(),
		VitePWA({
			registerType: 'autoUpdate',
			injectRegister: 'auto',
			// Not in dev, where it would answer with code older than what is being edited.
			devOptions: { enabled: false },
			manifest: {
				name: 'Glisp / Canvas',
				short_name: 'Canvas',
				description: 'A vector drawing app, whose drawing is a program',
				display: 'standalone',
				display_override: ['window-controls-overlay', 'standalone'],
				theme_color: '#1473e6',
				background_color: '#ffffff',
				icons: [
					{ src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
					{ src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
					{ src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
				],
				file_handlers: [
					{
						action: '/canvas/',
						accept: { 'application/x-glisp-canvas': ['.canvas.glisp'] },
					},
				],
			},
			workbox: {
				// Monaco's workers are large, and it is all needed to work offline.
				maximumFileSizeToCacheInBytes: 100 * 1024 * 1024,
				globPatterns: ['**/*.{js,css,html,svg,png,ttf,woff2}'],
			},
		}),
	],
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
