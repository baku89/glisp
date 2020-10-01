const path = require('path')

module.exports = {
	publicPath: './',
	productionSourceMap: false,
	devServer: {
		writeToDisk: true,
	},
	filenameHashing: false,
	configureWebpack: {
		output: {
			globalObject: 'globalThis',
			filename: '[name].js',
		},
		entry: {
			'lib/repl': path.join(__dirname, 'src/repl.ts'),
		},
		node: {
			__dirname: true,
		},
	},
	pages: {},
}
