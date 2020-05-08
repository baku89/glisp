<template>
	<div class="Editor">
		<div class="Editor__editor" ref="editor" />
	</div>
</template>

<script lang="ts">
import {Component, Prop, Vue, Watch} from 'vue-property-decorator'
import ace, {Range as AceRange} from 'brace'
import {appHandler} from '../mal/console'

function replaceRange(
	s: string,
	start: number,
	end: number,
	substitute: string
) {
	return s.substring(0, start) + substitute + s.substring(end)
}

@Component
export default class Editor extends Vue {
	@Prop({type: String, required: true}) private value!: string
	@Prop({type: Array, required: true}) private selection!: [number, number]
	@Prop({required: true}) private activeRange!: [number, number] | null
	@Prop({type: Boolean, default: false}) private dark!: boolean

	private editor!: ace.Editor
	private activeRangeMarker!: number

	private editedByProp = false

	private get theme() {
		return this.dark ? 'tomorrow_night' : 'tomorrow'
	}

	private mounted() {
		this.editor = ace.edit(this.$refs.editor as HTMLElement)

		require('brace/theme/tomorrow')
		require('brace/theme/tomorrow_night')
		require('brace/mode/clojure')

		this.editor.setTheme(`ace/theme/${this.theme}`)
		this.editor.setValue(this.value, -1)
		this.editor.$blockScrolling = Infinity
		this.editor.setShowPrintMargin(false)
		this.editor.setOption('displayIndentGuides', false)

		const session = this.editor.getSession()
		session.setMode('ace/mode/clojure')

		this.editor.setOptions({
			highlightActiveLine: false,
			showGutter: false,
			tabSize: 2,
			useSoftTabs: false,
			maxLines: Infinity
		})

		this.editor.getSession().setUseWrapMode(true)

		this.editor.on('change', this.onChange)
		this.editor.on('changeSelection', this.onSelect)

		this.editor.commands.addCommand({
			name: 'selectOuter',
			bindKey: {win: 'Ctrl-p', mac: 'Command-p'},
			exec: () => {
				appHandler.emit('select-outer')
			}
		})

		// Updater

		const sel = this.editor.getSelection()
		const doc = this.editor.getSession().doc

		const wheelSpeed = (e: MouseWheelEvent) => {
			return (e.shiftKey ? 2 : e.altKey ? 0.02 : 0.5) / 10
		}

		const Updaters = [
			{
				match: /^[-+]?[0-9]+$/,
				parse: (s: string) => parseInt(s),
				update: (val: number, e: MouseWheelEvent) =>
					Math.round(val - e.deltaY * wheelSpeed(e)),
				toString: (val: number) => val.toString()
			},
			{
				match: /^[-+]?([0-9]*\.[0-9]+|[0-9]+)$/,
				parse: (s: string) => parseFloat(s),
				update: (val: number, e: MouseWheelEvent) =>
					val - e.deltaY * wheelSpeed(e),
				toString: (val: number) => val.toFixed(1)
			},
			{
				// Int 2
				match: /^[-+]?[0-9]+ [-+]?[0-9]+$/,
				parse: (s: string) => s.split(' ').map(parseFloat),
				update: ([x, y]: number[], e: MouseWheelEvent) => [
					x - e.deltaX * wheelSpeed(e),
					y - e.deltaY * wheelSpeed(e)
				],
				toString: (val: number[]) => val.map(v => v.toFixed(0)).join(' ')
			},
			{
				// Float 2
				match: /^[-+]?([0-9]*\.[0-9]+|[0-9]+) [-+]?([0-9]*\.[0-9]+|[0-9]+)$/,
				parse: (s: string) => s.split(' ').map(parseFloat),
				update: ([x, y]: number[], e: MouseWheelEvent) => [
					x - e.deltaX * wheelSpeed(e),
					y - e.deltaY * wheelSpeed(e)
				],
				toString: (val: number[]) => val.map(v => v.toFixed(1)).join(' ')
			}
		]

		let listener: any = null

		sel.on('changeSelection', (e: string) => {
			if (listener) {
				window.removeEventListener('mousewheel', listener)
			}

			const origStr = this.editor.getCopyText()

			if (origStr.trim() === '') {
				return
			}

			const updater = Updaters.find(({match}) => origStr.match(match))

			if (updater) {
				const [start, end] = this.getSelection()

				let val = updater.parse(origStr)
				const text = this.editor.getValue()

				const range = sel.getRange()

				listener = (e: WheelEvent) => {
					val = updater.update(val as any, e)

					const newStr = updater.toString(val as any)
					const newText = replaceRange(text, start, end, newStr)

					const newEnd = doc.indexToPosition(
						end + (newStr.length - origStr.length),
						0
					)

					range.setEnd(newEnd.row, newEnd.column)

					this.editor.setValue(newText)
					sel.setRange(range, false)
				}

				window.addEventListener('mousewheel', listener, {once: true})
			}
		})
	}

	private beforeDestroy() {
		this.editor.destroy()
		this.editor.container.remove()
	}

	private onChange() {
		const value = this.editor.getValue()
		this.$emit('input', value)
	}

	private onSelect() {
		const selection = this.getSelection()
		this.$emit('select', selection)
	}

	private getSelection() {
		const sel = this.editor.getSelection()
		const doc = this.editor.getSession().doc

		const range = sel.getRange()
		const start = doc.positionToIndex(range.start, 0)
		const end = doc.positionToIndex(range.end, 0)

		return [start, end]
	}

	private convertToAceRange(start: number, end: number) {
		const sel = this.editor.getSelection()
		const doc = this.editor.getSession().doc

		const s = doc.indexToPosition(start, 0)
		const e = doc.indexToPosition(end, 0)

		const range = this.editor.getSelectionRange()
		range.setStart(s.row, s.column)
		range.setEnd(e.row, e.column)

		return range
	}

	@Watch('value')
	private onValueChanged(newValue: string) {
		if (this.editor.getValue() !== newValue) {
			this.editor.off('change', this.onChange)
			this.editor.off('changeSelection', this.onSelect)

			this.editor.setValue(newValue, -1)

			this.editor.on('change', this.onChange)
			this.editor.on('changeSelection', this.onSelect)
		}
	}

	@Watch('lang')
	private onLangChanged(lang: string) {
		this.editor.getSession().setMode(`ace/mode/${lang}`)
	}

	@Watch('theme')
	private onThemeChanged(theme: string) {
		this.editor.setTheme(`ace/theme/${theme}`)
	}

	@Watch('activeRange')
	private onChangeActiveRange(value: [number, number] | null) {
		this.editor.session.removeMarker(this.activeRangeMarker)

		if (value !== null) {
			const [start, end] = value
			const range = this.convertToAceRange(start, end)
			this.activeRangeMarker = this.editor.session.addMarker(
				range,
				'active-range',
				'text',
				false
			)
		}
	}

	@Watch('selection')
	private onChangeSelection([start, end]: [number, number]) {
		const [oldStart, oldEnd] = this.getSelection()

		if (start !== oldStart || end !== oldEnd) {
			const range = this.convertToAceRange(start, end)
			this.editor.selection.setRange(range, false)
		}
	}
}
</script>

<style lang="stylus">
.Editor
	position relative
	overflow-y scroll
	width 100%
	height 100%

	.active-range
		position absolute
		background var(--yellow)
		opacity 0.2

	.ace_selection
		opacity 0.5

	&__editor
		position relative
		width 100%
		background transparent !important
		font-size 1rem

	.ace_editor
		font-family 'Fira Code', monospace, sans-serif !important
</style>
