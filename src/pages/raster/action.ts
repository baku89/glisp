export default interface Action {
	name: string
	icon?: string
	exec: (...payloads: any[]) => any
}
