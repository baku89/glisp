import beautify from 'json-beautify'

export function jsonBeautify(obj: any): string {
	return beautify(obj, null as any, 2, 20)
}
