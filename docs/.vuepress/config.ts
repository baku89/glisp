import { readdirSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { viteBundler } from '@vuepress/bundler-vite'
import { defaultTheme } from '@vuepress/theme-default'
import markdownItCjkFriendly from 'markdown-it-cjk-friendly'
import { defineUserConfig } from 'vuepress'

const repo = 'baku89/glisp'

// Auto-discover the typedoc-generated API pages so the sidebar tracks
// whatever modules src/ contains, without hand-listing them.
function apiSidebarChildren(): string[] {
	const dir = fileURLToPath(new URL('../api', import.meta.url))
	let files: string[]
	try {
		files = readdirSync(dir).filter(f => f.endsWith('.md'))
	} catch {
		return ['/api/index.md']
	}
	const index = files.includes('index.md') ? ['/api/index.md'] : []
	const rest = files
		.filter(f => f !== 'index.md')
		.sort()
		.map(f => `/api/${f}`)
	return [...index, ...rest]
}

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
					'/api/': [
						{
							text: 'API',
							children: apiSidebarChildren(),
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
				'クリエイティブソフトに組み込むための小さな S 式言語。TypeScript アプリのライブラリとして動きます。',
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
