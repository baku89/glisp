/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path')

module.exports = {
	entry: {
		'lib/core': './src/glisp-lib/core.ts',
		'lib/color': './src/glisp-lib/color.ts',
		'lib/path': './src/glisp-lib/path.ts',
		'lib/math': './src/glisp-lib/math.ts',
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
