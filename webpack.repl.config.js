const path = require('path')
const webpack = require('webpack')
const CopyPlugin = require('copy-webpack-plugin')

module.exports = {
	node: {
		__filename: false,
		__dirname: false,
	},
	entry: {
		index: './src/repl.ts',
		// 'lib/core': './src/mal-lib/core.ts',
		// 'lib/color': './src/mal-lib/color.ts',
		// 'lib/path': './src/mal-lib/path.ts',
		// 'lib/math': './src/mal-lib/math.ts',
	},
	mode: 'production',
	resolve: {
		alias: {
			'@': path.resolve(__dirname, 'src'),
		},
		extensions: ['.tsx', '.ts', '.js'],
	},
	module: {
		rules: [
			{
				test: /\.tsx?$/,
				use: 'ts-loader',
				exclude: /node_modules/,
			},
		],
	},
	target: 'node',
	output: {
		filename: '[name].js',
		path: path.resolve(__dirname, 'repl'),
		globalObject: 'this',
		libraryTarget: 'umd',
		libraryExport: '',
	},
	plugins: [
		new webpack.IgnorePlugin(/jsdom$/),
		new CopyPlugin({
			patterns: [
				{
					from: 'public/lib',
					to: 'lib',
				},
			],
		}),
	],
}
