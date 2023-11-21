/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path')

module.exports = {
	entry: {
		'lib/core': './src/mal-lib/core.ts',
		'lib/color': './src/mal-lib/color.ts',
		'lib/path': './src/mal-lib/path.ts',
		'lib/math': './src/mal-lib/math.ts',
	},
	mode: 'production',
	resolve: {
		alias: {
			'@': path.resolve(__dirname, 'src'),
		},
		extensions: ['.ts', '.js'],
	},
	module: {
		rules: [
			{
				test: /\.ts$/,
				use: 'ts-loader',
			},
		],
	},
	target: 'web',
	optimization: {
		minimize: false,
	},
	output: {
		filename: '[name].js',
		path: path.resolve(__dirname, 'public'),
		globalObject: 'this',
		libraryTarget: 'umd',
	},
}
