const WorkerPlugin = require('worker-plugin')
const path = require('path')
const webpack = require('webpack')

module.exports = {
	publicPath: './',
	productionSourceMap: false,
	devServer: {
		writeToDisk: true
	},
	filenameHashing: false,
	configureWebpack: {
		plugins: [
			new WorkerPlugin(),
			new webpack.ProvidePlugin({
				$: 'jquery',
				jQuery: 'jquery'
			})
		],
		output: {
			globalObject: 'globalThis',
			filename: '[name].js'
		},
		entry: {
			'lib/core': path.join(__dirname, 'src/mal-lib/core.ts'),
			'lib/path': path.join(__dirname, 'src/mal-lib/path.ts'),
			'lib/math': path.join(__dirname, 'src/mal-lib/math.ts'),
			'js/generator': path.join(__dirname, 'src/generator.ts')
		},
		node: {
			__dirname: false
		}
	},
	css: {
		loaderOptions: {
			css: {
				url: false
			}
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
