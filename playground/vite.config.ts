import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// GitHub Pages serves project sites under `/<repo>/`. The workflow sets
// BASE_PATH so this works for both the `/glisp/` project page and a
// custom domain (which would set BASE_PATH=/).
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
	base,
	plugins: [vue()],
	resolve: {
		alias: {
			'@core': fileURLToPath(new URL('../src', import.meta.url)),
		},
	},
	server: {
		port: 5173,
	},
})
