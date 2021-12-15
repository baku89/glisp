import beautify from 'json-beautify'

export function jsonStringify(obj: any): string {
	return beautify(obj, null as any, 2, 20)
}
