const path = require('path')
const CopyPlugin = require('copy-webpack-plugin')

module.exports = {
	node: {
		__filename: false,
		__dirname: false,
	},
	entry: {
		index: './src/repl.ts',
		'lib/core': './src/mal-lib/core.ts',
		// 'lib/color': './src/mal-lib/color.ts',
		// 'lib/path': './src/mal-lib/path.ts',
		// 'lib/math': './src/mal-lib/math.ts',
	},
	devtool: ' source-map',
	resolve: {
		alias: {
			'@': path.resolve(__dirname, 'src'),
		},
		extensions: ['.tsx', '.ts', '.js'],
	},
	module: {
		rules: [
			{
				enforce: 'pre',
				test: /\.(vue|(j|t)sx?)$/,
				exclude: [/node_modules/],
				use: [
					{
						loader: 'eslint-loader',
						options: {
							extensions: ['.js', '.jsx', '.vue', '.ts', '.tsx'],
							cache: true,
							emitWarning: true,
							emitError: false,
							formatter: undefined,
						},
					},
				],
			},
			{
				test: /\.tsx?$/,
				use: [
					{
						loader: 'ts-loader',
						options: {
							transpileOnly: false,
							happyPackMode: false,
							onlyCompileBundledFiles: true,
						},
					},
				],
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
