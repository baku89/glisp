<script lang="ts">
// Forked from: https://github.com/JanGuillermo/vue3-markdown-it

import _ from 'lodash'
import MarkdownIt from 'markdown-it'
import MarkdownItAnchor from 'markdown-it-anchor'
import MarkdownItDeflist from 'markdown-it-deflist'
import MarkdownItFootnote from 'markdown-it-footnote'
import MarkdownItTasklists from 'markdown-it-task-lists'
import MarkdownItTOC from 'markdown-it-toc-done-right'
import {editor} from 'monaco-editor'
import {h, onMounted, onUpdated, ref} from 'vue'

const props = {
	anchor: {
		type: Object,
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
	source: {
		type: String,
		default: '',
	},
	tasklists: {
		type: Object,
		default: () => ({}),
	},
	toc: {
		type: Object,
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
}

const HighlightPlugin = (md: MarkdownIt) => {
	const temp = md.renderer.rules.fence?.bind(md.renderer.rules)

	if (!temp) throw new Error('Invalid')

	md.renderer.rules.fence = (tokens, idx, options, env, slf) => {
		const token = tokens[idx]
		const code = token.content.trim()

		const uid = _.uniqueId('monaco-highlight_')

		editor.colorize(code, 'clojure', {}).then(html => {
			const el = document.getElementById(uid)
			if (el) el.innerHTML = html
		})

		return `<pre><code id="${uid}">${code}</code></pre>`
	}
}

export default {
	name: 'vue3-markdown-it',
	props,
	setup(props: any) {
		const md = ref()
		const renderMarkdown = () => {
			let markdown = new MarkdownIt()
				.use(MarkdownItAnchor, props.anchor)
				.use(MarkdownItDeflist)
				.use(HighlightPlugin)
				.use(MarkdownItFootnote)
				.use(MarkdownItTasklists, props.tasklists)
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
		onUpdated(() => renderMarkdown())

		return () => h('entry', {class: ['document'], innerHTML: md.value})
	},
}
</script>
