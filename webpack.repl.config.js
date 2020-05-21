const path = require('path')

module.exports = {
	entry: './src/repl.ts',
	mode: 'development',
	resolve: {
		alias: {
			'@': '/Users/baku/Sites/glisp/src'
		},
		extensions: ['.tsx', '.ts', '.mjs', '.js', '.jsx', '.vue', '.json', '.wasm']
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
	resolve: {
		extensions: ['.tsx', '.ts', '.js']
	},
	output: {
		filename: 'index.js',
		path: path.resolve(__dirname, 'repl')
	}
}
