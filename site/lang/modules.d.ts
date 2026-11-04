declare module '*.vue' {
	import type { DefineComponent } from 'vue'
	const component: DefineComponent<object, object, unknown>
	export default component
}

/** A shader, as what `vite-plugin-glsl` makes of it. */
declare module '*.frag' {
	const source: string
	export default source
}

declare module 'markdown-it-deflist'
declare module 'markdown-it-footnote'
