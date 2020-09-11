const WorkerPlugin = require('worker-plugin')
const path = require('path')
const webpack = require('webpack')
const CopyPlugin = require('copy-webpack-plugin')

module.exports = {
	publicPath: './',
	productionSourceMap: false,
	devServer: {
		writeToDisk: true,
	},
	filenameHashing: false,
	configureWebpack: {
		plugins: [
			new WorkerPlugin(),
			new webpack.ProvidePlugin({
				$: 'jquery',
				jQuery: 'jquery',
				'window.jQuery': 'jquery',
			}),
		],
		output: {
			globalObject: 'globalThis',
			filename: '[name].js',
		},
		entry: {
			'lib/core': path.join(__dirname, 'src/mal-lib/core.ts'),
			'lib/color': path.join(__dirname, 'src/mal-lib/color.ts'),
			'lib/path': path.join(__dirname, 'src/mal-lib/path.ts'),
			'lib/math': path.join(__dirname, 'src/mal-lib/math.ts'),
			'js/generator': path.join(__dirname, 'src/generator.ts'),
		},
		node: {
			__dirname: false,
		},
	},
	css: {
		loaderOptions: {
			css: {
				url: false,
			},
		},
	},
	chainWebpack: config => {
		config.plugin('html-js/index').tap(args => {
			args[0].hash = true
			args[0].minify = {
				removeComments: false,
				collapseWhitespace: false,
				removeAttributeQuotes: false,
				collapseBooleanAttributes: false,
				removeScriptTypeAttributes: false,
			}
			return args
		})

		// Copy logo.png to dist
		config.plugin('copy-assets').use(CopyPlugin, [
			{
				patterns: [
					{
						from: 'assets/logo.png',
						to: '.',
					},
				],
			},
		])
	},
	pages: {
		'js/index': {
			entry: 'src/pages/index.ts',
			template: 'public/index.html',
			filename: 'index.html',
		},
		'js/embed': {
			entry: 'src/pages/embed.ts',
			template: 'public/embed.html',
			filename: 'embed.html',
		},
	},
}
