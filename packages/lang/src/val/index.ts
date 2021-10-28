export type Value = Int | Bool | Fn

interface IVal {
	type: string
	print(): string
}

export class Int implements IVal {
	public type: 'int' = 'int'
	public constructor(public value: number) {}

	public print() {
		return this.value.toString()
	}
}

export class Bool implements IVal {
	public type: 'bool' = 'bool'
	public constructor(public value: boolean) {}

	public print() {
		return this.value.toString()
	}
}

export class Fn implements IVal {
	public type: 'fn' = 'fn'
	public constructor(public value: (...params: any[]) => Value) {}

	public print() {
		return '(-> <JS Function>)'
	}
}
