const WorkerPlugin = require('worker-plugin')

module.exports = {
	publicPath: './',
	productionSourceMap: false,
	devServer: {
		writeToDisk: true
	},
	configureWebpack: {
		plugins: [new WorkerPlugin()],
		output: {
			globalObject: 'self'
		}
	},
	chainWebpack: config => {
		config
			.entry('lib_path')
			.add('./src/mal-lib/path.ts')
			.end()
		config
			.entry('lib_core')
			.add('./src/mal-lib/core.ts')
			.end()

		config.plugin('html').tap(args => {
			args[0].excludeChunks = ['lib_core', 'lib_path']
			args[0].hash = false
			return args
		})
		config.plugins.delete('preload')
		config.plugins.delete('prefetch')
	}
}
