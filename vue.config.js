const WorkerPlugin = require('worker-plugin')
const path = require('path')

module.exports = {
	publicPath: './',
	productionSourceMap: false,
	devServer: {
		writeToDisk: true
	},
	filenameHashing: false,
	configureWebpack: {
		plugins: [new WorkerPlugin()],
		output: {
			globalObject: 'globalThis',
			filename: '[name].js'
		},
		entry: {
			'lib/core': path.join(__dirname, 'src/mal-lib/core.ts'),
			'lib/path': path.join(__dirname, 'src/mal-lib/path.ts')
		}
	},
	pages: {
		'js/index': {
			entry: 'src/pages/index.ts',
			template: 'public/index.html',
			filename: 'index.html'
		},
		'js/embed': {
			entry: 'src/pages/embed.ts',
			template: 'public/embed.html',
			filename: 'embed.html'
		}
	}
}
