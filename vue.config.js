const WorkerPlugin = require('worker-plugin')
const path = require('path')
const CopyPlugin = require('copy-webpack-plugin')
const argv = require('yargs/yargs')(process.argv.slice(3)).argv
const _ = require('lodash')

const PagesToBuild = require('./pages.json')
const MonacoEditorWebpackPlugin = require('monaco-editor-webpack-plugin')

PagesToBuild.unshift('index')

const PageSettings = {
	index: {
		entry: 'src/pages/index/index.ts',
		template: 'src/pages/template.html',
	},
	app: {
		entry: 'src/pages/app/index.ts',
		template: 'public/app.html',
	},
	embed: {
		entry: 'src/pages/embed/index.ts',
		template: 'src/pages/embed/embed.html',
	},
	ui: {
		entry: 'src/pages/ui/index.ts',
		template: 'src/pages/template.html',
	},
	repl: {
		entry: 'src/pages/repl/index.ts',
		template: 'src/pages/template.html',
	},
	easing: {
		entry: 'src/pages/easing/index.ts',
		template: 'src/pages/template.html',
	},
	'color-space': {
		entry: 'src/pages/color-space/index.ts',
		template: 'src/pages/template.html',
	},
	haptics: {
		entry: 'src/pages/haptics/index.ts',
		template: 'src/pages/template.html',
	},
	megei: {
		entry: 'src/pages/raster/index.ts',
		template: 'src/pages/template.html',
	},
}

const pages = _.fromPairs(
	_.map(PagesToBuild, name => {
		if (!PageSettings[name]) {
			return null
		}
		return [
			`js/${name}`,
			{
				...PageSettings[name],
				filename: `${name}.html`,
				title: `(glisp/${name})`,
			},
		]
	}).filter(_.identity)
)

module.exports = {
	publicPath: './',
	productionSourceMap: false,
	devServer: {
		writeToDisk: true,
		hot: false,
		liveReload: false,
	},
	configureWebpack: {
		plugins: [
			// new WorkerPlugin(),
			new MonacoEditorWebpackPlugin({
				languages: ['javascript', 'yaml', 'xml'],
			}),
		],
		output: {
			globalObject: 'globalThis',
			filename: '[name].js',
		},
		devtool: 'inline-source-map',
		/*
		entry: {
			'lib/core': path.join(__dirname, 'src/mal-lib/core.ts'),
			'lib/color': path.join(__dirname, 'src/mal-lib/color.ts'),
			'lib/path': path.join(__dirname, 'src/mal-lib/path.ts'),
			'lib/math': path.join(__dirname, 'src/mal-lib/math.ts'),
		},
		*/
		node: {
			__dirname: false,
		},
	},
	css: {
		loaderOptions: {
			css: {
				url: false,
			},
		},
	},
	chainWebpack: config => {
		// Disable HMR
		// https://stackoverflow.com/questions/51844289/turn-off-hot-reload-on-project-started-with-vue-cli-3-webpack-4-15-1
		config.plugins.delete('hmr')

		// Add environment specific variables
		config.plugin('define').tap(args => {
			args[0] = {...args[0], __PAGES__: JSON.stringify(PagesToBuild.slice(1))}
			return args
		})

		// Customize TypeScript compliation options
		config.module
			.rule('ts')
			.use('ts-loader')
			.tap(args => {
				args.onlyCompileBundledFiles = true
				return args
			})

		// Glslify
		config.module
			.rule('glsl')
			.test(/\.(glsl|vs|fs|vert|frag)$/)
			.use('raw')
			.loader('raw-loader')
			.end()
			.use('glslify')
			.loader('glslify-loader')

		// Peg.js
		config.module
			.rule('pegjs')
			.test(/\.pegjs$/)
			.use('raw')
			.loader('raw-loader')
			.end()

		// Markdown
		config.module
			.rule('markdown')
			.test(/\.md$/)
			.use('raw')
			.loader('raw-loader')
			.end()

		// Copy logo.png to dist
		config.plugin('copy-assets').use(CopyPlugin, [
			{
				patterns: [
					{from: 'assets/logo.png', to: '.'},
					{from: 'assets/codicon.ttf', to: '.'},
					{from: 'docs', to: './docs'},
					{from: 'src/pages/raster/samples', to: './samples'},
				],
			},
		])
	},
	pages: pages,
}
