import { fileURLToPath, URL } from 'node:url'

import { viteBundler } from '@vuepress/bundler-vite'
import { defaultTheme } from '@vuepress/theme-default'
import glsl from 'vite-plugin-glsl'
import { defineUserConfig } from 'vuepress'

const repo = 'baku89/glisp'

export default defineUserConfig({
	title: 'Glisp',
	base: '/lang/',
	head: [
		['link', { rel: 'icon', href: '/lang/logo.svg' }],
		['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
		[
			'link',
			{ rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
		],
		[
			'link',
			{
				rel: 'stylesheet',
				href: 'https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500&family=Geist+Mono:wght@400;500&display=swap',
				crossorigin: 'anonymous',
			},
		],
	],
	theme: defaultTheme({
		docsDir: 'site/lang',
		docsBranch: 'lang-2026',
		logo: '/logo.svg',
		repo,
		locales: {
			'/': {
				navbar: [
					{ text: 'Home', link: '/' },
					{ text: 'Guide', link: '/guide' },
					{ text: 'Playground', link: '/playground' },
					{
						text: 'Spec',
						children: [
							{ text: 'Overview', link: '/spec/' },
							{ text: 'Syntax', link: '/spec/syntax' },
							{ text: 'Types', link: '/spec/types' },
							{ text: 'Evaluation', link: '/spec/eval' },
							{ text: 'Host API', link: '/spec/host-api' },
						],
					},
				],
				sidebar: {
					'/spec/': [
						{
							text: 'Specification',
							children: [
								'/spec/README.md',
								'/spec/syntax.md',
								'/spec/types.md',
								'/spec/eval.md',
								'/spec/host-api.md',
							],
						},
					],
				},
			},
		},
	}),
	locales: {
		'/': {
			lang: 'en-US',
			title: 'Glisp',
			description:
				'A small guest language for creative software. Hosted on TypeScript, embedded in design tools, motion editors, and generative pipelines.',
		},
	},
	bundler: viteBundler({
		viteOptions: {
			// Tweeq is used from source, as a submodule. Without dedupe there would
			// be two copies of its stores' pinia and of vue.
			plugins: [glsl()],
			resolve: {
				dedupe: ['vue', 'pinia', '@vueuse/core'],
				alias: [
					{
						find: /^tweeq(\/.*)?$/,
						replacement: fileURLToPath(
							new URL('../../../dev_modules/tweeq/src$1', import.meta.url)
						),
					},
				],
			},
		},
	}),
	markdown: {
		linkify: true,
		typographer: true,
	},
})
