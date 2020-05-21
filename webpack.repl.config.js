const path = require('path')
const webpack = require('webpack')
const CopyPlugin = require('webpack-copy-plugin')

module.exports = {
	entry: {
		index: './src/repl.ts',
		'lib/core': './src/mal-lib/core.ts'
	},
	mode: 'production',
	resolve: {
		alias: {
			'@': path.resolve(__dirname, 'src')
		},
		extensions: ['.tsx', '.ts', '.js']
	},
	module: {
		rules: [
			{
				test: /\.tsx?$/,
				use: 'ts-loader',
				exclude: /node_modules/
			}
		]
	},
	target: 'node',
	output: {
		filename: '[name].js',
		path: path.resolve(__dirname, 'repl'),
		globalObject: 'this',
		libraryTarget: 'umd',
		libraryExport: ''
	},
	plugins: [
		new webpack.IgnorePlugin(/jsdom$/),
		new CopyPlugin([
			{
				from: path.resolve(__dirname, 'public/lib'),
				to: path.resolve(__dirname, 'test'),
				toType: ''
			}
		])
	]
}
