// vite.config.js
import {resolve} from 'path'
import {fileURLToPath} from 'url'
import {defineConfig} from 'vite'

export default defineConfig({
	build: {
		lib: {
			entry: resolve(__dirname, 'src/mal-lib/core.ts'),
			name: 'GlispCore',
			fileName: 'glisp-core',
		},
		outDir: 'public/lib2',
	},
	resolve: {
		alias: [
			{
				find: '@',
				replacement: fileURLToPath(new URL('./src', import.meta.url)),
			},
		],
	},
})
