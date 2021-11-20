export function memoizeMethod<T extends string, V extends NonNullable<any>>(
	thisVal: {[field in T]: V},
	cacheField: T,
	fn: (...args: any[]) => V
) {
	function mfn(...args: any[]) {
		return (thisVal[cacheField] ??= fn(...args))
	}
	return mfn.bind(thisVal)
}
