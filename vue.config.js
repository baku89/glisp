module.exports = {
	publicPath: './',
	chainWebpack: config => {
		// GraphQL Loader
		config.module
			.rule('worker')
			.test(/\.worker.ts$/)
			.use('worker-loader')
			.loader('worker-loader')
			.end()
	}
}
