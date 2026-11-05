import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig, type Plugin } from 'vite'
import glsl from 'vite-plugin-glsl'
import { type ManifestOptions, VitePWA } from 'vite-plugin-pwa'

// Pages serves this repository under a path of its own, which the deploy says.
const base = `${process.env.SITE_BASE ?? ''}/canvas/`

/** What is being built, for the app to say. */
const commit = (): string => {
	try {
		return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
	} catch {
		return 'unknown'
	}
}

const source = (name: string) =>
	fileURLToPath(new URL(`../../dev_modules/${name}/src$1`, import.meta.url))

const manifest = {
	name: 'Glisp Canvas',
	short_name: 'Glisp Canvas',
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
			action: base,
			accept: {
				'image/svg+xml': ['.glisp.svg'],
				'application/x-glisp-canvas': ['.canvas.glisp'],
			},
		},
	],
} satisfies Partial<ManifestOptions>

/**
 * The dev server can be installed as an app too. A manifest is all that takes,
 * so unlike VitePWA's dev mode this registers no service worker, and what is
 * being edited is always what runs.
 */
function installableInDev(): Plugin {
	const url = `${base}manifest.webmanifest`
	return {
		name: 'canvas:installable-in-dev',
		apply: 'serve',
		configureServer(server) {
			server.middlewares.use(url, (_req, res) => {
				res.setHeader('Content-Type', 'application/manifest+json')
				res.end(
					JSON.stringify({
						...manifest,
						name: 'Glisp Canvas (dev)',
						short_name: 'Canvas dev',
						start_url: base,
						scope: base,
					})
				)
			})
		},
		transformIndexHtml: () => [
			{ tag: 'link', attrs: { rel: 'manifest', href: url }, injectTo: 'head' },
		],
	}
}

export default defineConfig({
	base,
	define: { 'import.meta.env.VITE_COMMIT': JSON.stringify(commit()) },
	// Paused for now: an edit shows only after reloading the page by hand.
	server: { hmr: false },
	plugins: [
		vue(),
		glsl(),
		installableInDev(),
		VitePWA({
			registerType: 'autoUpdate',
			injectRegister: 'auto',
			// Not in dev, where it would answer with code older than what is being edited.
			devOptions: { enabled: false },
			manifest,
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
