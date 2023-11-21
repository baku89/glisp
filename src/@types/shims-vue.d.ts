declare module '*.vue' {
	import type {DefineComponent} from 'vue'
	const component: DefineComponent
	export default component
}

declare module '*.frag' {
	const value: string
	export default value
}
