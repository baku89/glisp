<template>
	<div class="InputCodeEditor">
		<div class="InputCodeEditor__editor" ref="editor" />
	</div>
</template>

<script lang="ts">
import {Component, Prop, Vue, Watch} from 'vue-property-decorator'
import ace, {Range} from 'brace'

function replaceRange(
	s: string,
	start: number,
	end: number,
	substitute: string
) {
	return s.substring(0, start) + substitute + s.substring(end)
}

@Component
export default class InputCodeEditor extends Vue {
	@Prop({type: String, required: true}) private value!: string
	@Prop({type: String, default: 'text'}) private lang!: string
	@Prop({type: String, default: 'tomorrow'}) private theme!: string
	@Prop({type: Array}) private selection!: [number, number]
	@Prop() private activeRange!: [number, number] | null

	private editor!: ace.Editor
	private activeRangeMarker!: number

	private editedByProp = false

	private mounted() {
		this.editor = ace.edit(this.$refs.editor as HTMLElement)

		require('brace/theme/tomorrow')
		require('brace/theme/tomorrow_night')
		require(`brace/mode/${this.lang}`)

		this.editor.getSession().setMode(`ace/mode/${this.lang}`)
		this.editor.setTheme(`ace/theme/${this.theme}`)
		this.editor.setValue(this.value, -1)
		this.editor.$blockScrolling = Infinity

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

		// Updater

		const sel = this.editor.getSelection()
		const doc = this.editor.getSession().doc

		const Updaters = [
			{
				match: /^[-+]?[0-9]+$/,
				update: (val: number, e: MouseWheelEvent) =>
					Math.round(val - e.deltaY / 10),
				parse: (s: string) => parseInt(s),
				toString: (val: number) => val.toString()
			},
			{
				match: /^[-+]?([0-9]*\.[0-9]+|[0-9]+)$/,
				update: (val: number, e: MouseWheelEvent) => val - e.deltaY / 10,
				parse: (s: string) => parseFloat(s),
				toString: (val: number) => val.toFixed(1)
			},
			{
				// Vector 2
				match: /^[-+]?[0-9]+ [-+]?[0-9]+$/,
				update: ([x, y]: number[], e: MouseWheelEvent) => [
					x - e.deltaX / 10,
					y - e.deltaY / 10
				],
				parse: (s: string) => s.split(' ').map(parseFloat),
				toString: (val: number[]) => val.map(v => v.toFixed(0)).join(' ')
			}
		]

		let listener: any = null

		sel.on('changeSelection', (e: string) => {
			if (listener) {
				window.removeEventListener('mousewheel', listener)
			}

			const range = sel.getRange()
			const start = doc.positionToIndex(range.start, 0)
			const end = doc.positionToIndex(range.end, 0)

			const origStr = doc.getTextRange(range)

			const updater = Updaters.find(({match}) => origStr.match(match))

			if (updater) {
				let val = updater.parse(origStr)
				const text = this.editor.getValue()

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

			this.editor.setValue(newValue)

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
			const range = this.convertToAceRange(start, end + 1)
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

.InputCodeEditor
	position relative
	overflow-y scroll
	width 100%
	height 100%

	.active-range
		position absolute
		background var(--currentline)

	&__editor
		position relative
		width 100%
		background transparent
		font-size 1rem
		font-family 'Fira Code', monospace, sans-serif
</style>
