<script lang="ts">
// Forked from: https://github.com/JanGuillermo/vue3-markdown-it

import './katex.min.css'

import MarkdownItKatex from '@traptitech/markdown-it-katex'
import MarkdownIt from 'markdown-it'
import MarkdownItAnchor from 'markdown-it-anchor'
import MarkdownItDeflist from 'markdown-it-deflist'
import MarkdownItFootnote from 'markdown-it-footnote'
import MarkdownItTOC, {TocOptions} from 'markdown-it-toc-done-right'
import {h, onMounted, PropType, ref, watch} from 'vue'

import MarkdownItMonacoHighlight from './markdown-it-monaco-highlight'

export default {
	name: 'vue3-markdown-it',
	props: {
		source: {
			type: String,
			default: '',
		},
		anchor: {
			type: Object as PropType<MarkdownItAnchor.AnchorOptions>,
			default: () => ({}),
		},
		breaks: {
			type: Boolean,
			default: false,
		},
		html: {
			type: Boolean,
			default: false,
		},
		langPrefix: {
			type: String,
			default: 'language-',
		},
		linkify: {
			type: Boolean,
			default: false,
		},
		quotes: {
			type: String,
			default: '“”‘’',
		},
		toc: {
			type: Object as PropType<TocOptions>,
			default: () => ({}),
		},
		typographer: {
			type: Boolean,
			default: false,
		},
		xhtmlOut: {
			type: Boolean,
			default: false,
		},
	},
	setup(props: any) {
		const md = ref()
		const renderMarkdown = () => {
			let markdown = new MarkdownIt()
				.use(MarkdownItAnchor, props.anchor)
				.use(MarkdownItDeflist)
				.use(MarkdownItFootnote)
				.use(MarkdownItKatex)
				.use(MarkdownItMonacoHighlight)
				.use(MarkdownItTOC, props.toc)
				.set({
					breaks: props.breaks,
					html: props.html,
					langPrefix: props.langPrefix,
					linkify: props.linkify,
					quotes: props.quotes,
					typographer: props.typographer,
					xhtmlOut: props.xhtmlOut,
				})

			md.value = markdown.render(props.source)
		}

		onMounted(() => renderMarkdown())
		watch(props, renderMarkdown)

		return () => h('entry', {class: ['document'], innerHTML: md.value})
	},
}
</script>
