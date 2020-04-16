const WorkerPlugin = require('worker-plugin')

module.exports = {
	publicPath: './',
	configureWebpack: {
		plugins: [new WorkerPlugin()]
	}
}
