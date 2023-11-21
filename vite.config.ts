import vue from '@vitejs/plugin-vue'
import path from 'path'
import Markdown from 'unplugin-vue-markdown/vite'
import {fileURLToPath} from 'url'
import {defineConfig} from 'vite'
import glsl from 'vite-plugin-glsl'
import {VitePWA} from 'vite-plugin-pwa'

export default defineConfig({
	base: './',
	server: {
		port: 5858,
	},
	plugins: [
		glsl(),
		vue({
			include: [/\.vue$/, /\.md$/], // <-- allows Vue to compile Markdown files
		}),
		Markdown({}),
		VitePWA({
			registerType: 'autoUpdate',
			injectRegister: 'auto',
			devOptions: {
				enabled: true,
			},
			manifest: {
				name: 'Glisp',
				short_name: 'Glisp',
				theme_color: '#1a1a1a',
				display: 'standalone',
				display_override: ['window-controls-overlay', 'standalone'],
				icons: [
					{
						src: 'icon.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'any',
					},
				],
			},
		}),
	],
	resolve: {
		alias: [
			{
				find: '@',
				replacement: fileURLToPath(new URL('./src', import.meta.url)),
			},
			{
				find: 'tweeq',
				replacement: fileURLToPath(
					new URL('./dev_modules/tweeq/src', import.meta.url)
				),
			},
		],
	},
	build: {
		rollupOptions: {
			input: [path.resolve(__dirname, 'src/glisp-lib/core.ts')],
			output: {
				preserveModules: false,
			},
		},
		outDir: 'dist',
		emptyOutDir: true,
	},
	define: {
		// This is needed to make the PromiseQueue class available in the browser.
		'process.env.PROMISE_QUEUE_COVERAGE': false,
	},
})
