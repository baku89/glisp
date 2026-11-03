import { viteBundler } from '@vuepress/bundler-vite'
import { defaultTheme } from '@vuepress/theme-default'
import { defineUserConfig } from 'vuepress'

const repo = 'baku89/glisp'

export default defineUserConfig({
	title: 'Glisp',
	base: '/glisp/',
	head: [
		['link', { rel: 'icon', href: '/glisp/logo.svg' }],
		['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
		[
			'link',
			{ rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
		],
		[
			'link',
			{
				rel: 'stylesheet',
				href: 'https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500&display=swap',
				crossorigin: 'anonymous',
			},
		],
	],
	theme: defaultTheme({
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
	bundler: viteBundler(),
	markdown: {
		linkify: true,
		typographer: true,
	},
})
