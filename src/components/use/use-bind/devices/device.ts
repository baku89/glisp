export default abstract class Device {
	abstract bind(command: string, callback: () => any): any
	abstract listen(callback: (command: string) => any): any
	abstract abortListen(): any
}
