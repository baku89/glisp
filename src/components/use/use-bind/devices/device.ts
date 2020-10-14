export default abstract class Device {
	abstract bind(command: string, callback: () => any): any
	abstract capture(callback: (command: string) => any): any
	abstract cancelCapture(): any
}
