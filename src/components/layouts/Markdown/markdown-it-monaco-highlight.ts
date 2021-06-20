import _ from 'lodash'
import MarkdownIt from 'markdown-it'
import {editor} from 'monaco-editor'

import {useMonacoEditor} from '../MonacoEditor'

const MarkdownItMonacoHighlight = (md: MarkdownIt) => {
	useMonacoEditor()

	const temp = md.renderer.rules.fence?.bind(md.renderer.rules)

	if (!temp) throw new Error('Cannot retrieve fence function from MarkdownIt')

	md.renderer.rules.fence = (tokens, idx, options, env, slf) => {
		const token = tokens[idx]
		const code = token.content.trim()

		const uid = _.uniqueId('Markdown__highlight_')
		token.attrPush(['id', uid])

		editor.setTheme('custom-theme')

		editor.colorize(code, 'glsl', {}).then(html => {
			const el = document.getElementById(uid)
			if (el) el.innerHTML = html
		})

		return temp(tokens, idx, options, env, slf)
	}
}

export default MarkdownItMonacoHighlight
