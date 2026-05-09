import { fileURLToPath, URL } from 'node:url'

import { viteBundler } from '@vuepress/bundler-vite'
import { defaultTheme } from '@vuepress/theme-default'
import markdownItCjkFriendly from 'markdown-it-cjk-friendly'
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
				selectLanguageName: 'English',
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
					{ text: 'API', link: '/api/' },
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
			'/ja/': {
				selectLanguageName: '日本語',
				navbar: [
					{ text: 'ホーム', link: '/ja/' },
					{ text: 'ガイド', link: '/ja/guide' },
					{ text: 'プレイグラウンド', link: '/ja/playground' },
					{
						text: '仕様',
						children: [
							{ text: '概要', link: '/spec/' },
							{ text: '構文', link: '/spec/syntax' },
							{ text: '型', link: '/spec/types' },
							{ text: '評価', link: '/spec/eval' },
							{ text: 'Host API', link: '/spec/host-api' },
						],
					},
					{ text: 'API', link: '/api/' },
				],
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
		'/ja/': {
			lang: 'ja-JP',
			title: 'Glisp',
			description:
				'クリエイティブソフトに組み込むための小さなゲスト言語。TypeScript の上に乗り、デザインツール・モーションエディタ・ジェネラティブパイプラインを動かすコア',
		},
	},
	bundler: viteBundler({
		viteOptions: {
			resolve: {
				alias: {
					'@core': fileURLToPath(new URL('../../src', import.meta.url)),
				},
			},
		},
	}),
	extendsMarkdown: md => {
		md.use(markdownItCjkFriendly)
	},
	markdown: {
		// @ts-expect-error: vuepress passes through markdown-it options
		linkify: true,
		typographer: true,
	},
})
