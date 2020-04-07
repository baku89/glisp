module.exports = {
	chainWebpack: config => {
		config.module
			.rule('raw')
			.test(/\.mal$/)
			.use('raw-loader')
			.loader('raw-loader')
			.end()
	}
}
