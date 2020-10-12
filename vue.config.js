const WorkerPlugin = require('worker-plugin')
const path = require('path')
const CopyPlugin = require('copy-webpack-plugin')

module.exports = {
	publicPath: './',
	productionSourceMap: false,
	devServer: {
		writeToDisk: true,
	},
	filenameHashing: false,
	configureWebpack: {
		plugins: [new WorkerPlugin()],
		output: {
			globalObject: 'globalThis',
			filename: '[name].js',
		},
		entry: {
			'lib/core': path.join(__dirname, 'src/mal-lib/core.ts'),
			// 'lib/color': path.join(__dirname, 'src/mal-lib/color.ts'),
			// 'lib/path': path.join(__dirname, 'src/mal-lib/path.ts'),
			// 'lib/math': path.join(__dirname, 'src/mal-lib/math.ts'),
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
		config.module
			.rule('ts')
			.use('ts-loader')
			.tap(args => {
				args.onlyCompileBundledFiles = true
				return args
			})
		// config.plugin('html-js/index').tap(args => {
		// 	args[0].hash = true
		// 	args[0].minify = {
		// 		removeComments: false,
		// 		collapseWhitespace: false,
		// 		removeAttributeQuotes: false,
		// 		collapseBooleanAttributes: false,
		// 		removeScriptTypeAttributes: false,
		// 	}
		// 	return args
		// })
		config.plugin('html-js/interpreter').tap(args => {
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

		// Add jQuery loader
		config.module
			.rule('jquery')
			.test(require.resolve('jquery'))
			.use('jquery')
			.loader('expose-loader')
			.options({
				exposes: ['$', 'jQuery'],
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
		// 'js/index': {
		// 	entry: 'src/pages/index.ts',
		// 	template: 'public/index.html',
		// 	filename: 'index.html',
		// },
		// 'js/embed': {
		// 	entry: 'src/pages/embed.ts',
		// 	template: 'public/embed.html',
		// 	filename: 'embed.html',
		// },
		'js/interpreter': {
			entry: 'src/pages/interpreter.ts',
			template: 'public/interpreter.html',
			filename: 'interpreter.html',
		},
	},
}
