<template>
	<div class="MonacoEditor" ref="rootEl" />
</template>

<script lang="ts">
import './languages/glisp'
import './languages/glsl'

import {templateRef} from '@vueuse/core'
import * as Monaco from 'monaco-editor'
import {
	defineComponent,
	inject,
	onMounted,
	onUnmounted,
	Ref,
	ref,
	watch,
} from 'vue'

export default defineComponent({
	name: 'MonacoEditor',
	props: {
		modelValue: {
			type: String,
			required: true,
		},
		lang: {
			type: String,
			default: 'glisp',
		},
	},
	emits: ['update:modelValue'],
	setup(props, context) {
		const rootEl = templateRef('rootEl')

		let editor: ReturnType<typeof Monaco.editor.create>

		const scheme = inject<Ref<{[name: string]: string}>>('scheme', ref({}))

		onMounted(() => {
			if (!rootEl.value) return

			editor = Monaco.editor.create(rootEl.value as HTMLElement, {
				value: props.modelValue,
				language: props.lang,
				fontFamily: "'Fira Code'",
				minimap: {enabled: false},
				folding: false,
				lineNumbers: 'off',
				lineHeight: 21,
				fontLigatures: true,
				fontSize: 14,
				renderLineHighlight: 'none',
			})
			;(window as any).monaco = editor

			watch(
				() => scheme,
				() => {
					if (!editor) return

					const {
						base00,
						base01,
						base02,
						base03,
						base04,
						base05,
						base06,
						base07,
						base08,
						base09,
						base0A,
						base0B,
						base0C,
						base0D,
						base0E,
						base0F,
						accent,
					} = scheme.value

					const frame = base05 + '33'

					Monaco.editor.defineTheme('custom-theme', {
						base: 'vs',
						inherit: true,
						rules: [
							{token: '', foreground: base04},
							{token: 'string', foreground: base0B},
							{token: 'string.escape', foreground: base0C},
							{token: 'comment', foreground: base03},
							{token: 'white', foreground: base03},
							{token: 'number', foreground: base09},
							{token: 'delimiter.slash', foreground: base0A},
							{token: 'delimiter', foreground: base05},
							{token: 'constant', foreground: base09},
							{token: 'support', foreground: base0C},
							{token: 'identifier', foreground: base08},
							{token: 'function', foreground: base0D},
							{token: 'keyword', foreground: base0E},
						],
						colors: {
							'editorBracketMatch.background': base02,
							'editorBracketMatch.border': base03,
							foreground: base05,
							'selection.background': base09,
							descriptionForeground: base03,
							errorForeground: base0B,
							focusBorder: accent,
							'icon.foreground': base04,
							'textBlockQuote.background': base01,
							'textBlockQuote.border': base09,
							'textCodeBlock.background': base01,
							'textLink.activeForeground': base08,
							'textLink.foreground': base09,
							'textPreformat.foreground': base09,
							'button.background': base01,
							'button.foreground': base07,
							'button.hoverBackground': base04,
							'button.secondaryForeground': base07,
							'button.secondaryBackground': base0F,
							'button.secondaryHoverBackground': base04,
							'checkbox.background': base01,
							'checkbox.foreground': base05,
							'dropdown.background': base00,
							'dropdown.border': frame,
							'dropdown.listBackground': base01,
							'dropdown.foreground': base05,
							'input.background': base01,
							'input.foreground': base05,
							'input.placeholderForeground': base03,
							'inputOption.activeBackground': base02,
							'inputOption.activeForeground': base05,
							'inputValidation.errorBackground': base0B,
							'inputValidation.errorForeground': base05,
							'inputValidation.errorBorder': base0B,
							'inputValidation.infoBackground': base09,
							'inputValidation.infoForeground': base05,
							'inputValidation.infoBorder': base09,
							'inputValidation.warningBackground': base0D,
							'inputValidation.warningForeground': base05,
							'inputValidation.warningBorder': base0D,
							'scrollbar.shadow': '#00000000',
							'scrollbarSlider.activeBackground': base02 + '6f',
							'scrollbarSlider.background': '#ff0000',
							'scrollbarSlider.hoverBackground': '#f0f',
							'badge.background': base00,
							'badge.foreground': base05,
							'activityBar.background': '#00000000',
							'activityBar.dropBackground': base07,
							'activityBar.foreground': base05,
							'activityBar.inactiveForeground': base03,
							'activityBarBadge.background': base09,
							'activityBarBadge.foreground': base07,
							'activityBar.activeBackground': base02,
							'minimapGutter.addedBackground': base0E,
							'minimapGutter.modifiedBackground': base0F,
							'minimapGutter.deletedBackground': base0B,
							'editorGroup.background': '#00000000',
							'editorGroup.dropBackground': base02 + '6f',
							'editorGroupHeader.noTabsBackground': base01,
							'editorGroupHeader.tabsBackground': base01,
							'editorGroup.emptyBackground': '#00000000',
							'tab.activeBackground': '#00000000',
							'tab.unfocusedActiveBackground': '#00000000',
							'tab.activeForeground': base05,
							'tab.inactiveBackground': base01,
							'tab.inactiveForeground': base03,
							'tab.unfocusedActiveForeground': base04,
							'tab.unfocusedInactiveForeground': base03,
							'tab.hoverBackground': base02,
							'tab.unfocusedHoverBackground': base02,
							'tab.activeModifiedBorder': base09,
							'tab.inactiveModifiedBorder': base09,
							'tab.unfocusedActiveModifiedBorder': base09,
							'tab.unfocusedInactiveModifiedBorder': base09,
							'editorPane.background': '#00000000',
							'editor.background': '#00000000',
							'editor.foreground': base05,
							'editorCursor.foreground': base05,
							'editor.selectionBackground': base01,
							'editor.inactiveSelectionBackground': base01,
							'editor.selectionHighlightBackground': base01,
							'editor.wordHighlightBackground': base02 + '6f',
							'editor.wordHighlightStrongBackground': base03 + '6f',
							'editor.findMatchBackground': base0D + '6f',
							'editor.findMatchHighlightBackground': base0C + '6f',
							'editor.findRangeHighlightBackground': base01 + '6f',
							'editor.hoverHighlightBackground': base02 + '6f',
							'editor.lineHighlightBackground': base01,
							'editorLink.activeForeground': base09,
							'editor.rangeHighlightBackground': base01 + '6f',
							'editorWhitespace.foreground': base01,
							'editorIndentGuide.background': base01,
							'editorIndentGuide.activeBackground': base02,
							'editorRuler.foreground': base03,
							'editorCodeLens.foreground': base02,
							'editorLightBulb.foreground': base0D,
							'editorLightBulbAutoFix.foreground': base09,
							'editorOverviewRuler.findMatchForeground': base0D + '6f',
							'editorOverviewRuler.rangeHighlightForeground': base03 + '6f',
							'editorOverviewRuler.selectionHighlightForeground': base02 + '6f',
							'editorOverviewRuler.wordHighlightForeground': base07 + '6f',
							'editorOverviewRuler.wordHighlightStrongForeground':
								base09 + '6f',
							'editorOverviewRuler.errorForeground': base0B,
							'editorOverviewRuler.warningForeground': base0D,
							'editorOverviewRuler.infoForeground': base08,
							'editorOverviewRuler.bracketMatchForeground': base06,
							'editorOverviewRuler.border': base01,
							'editorError.foreground': base0B,
							'editorWarning.foreground': base0D,
							'editorInfo.foreground': base08,
							'editorHint.foreground': base09,
							'problemsErrorIcon.foreground': base0B,
							'problemsWarningIcon.foreground': base0D,
							'problemsInfoIcon.foreground': base08,
							'editorGutter.background': '#00000000',
							'editorGutter.commentRangeForeground': base04,
							'editorGutter.foldingControlForeground': base05,
							'editorWidget.foreground': base05,
							'editorWidget.background': base00,
							'editorWidget.border': accent,
							'editorSuggestWidget.background': base00,
							'editorSuggestWidget.border': base05 + '33',
							'editorSuggestWidget.foreground': base04,
							'editorSuggestWidget.highlightForeground': accent,
							'editorSuggestWidget.selectedBackground': base01,
							'editorHoverWidget.foreground': base05,
							'editorHoverWidget.background': '#00000000',
							'keybindingLabel.background': '#ff000000',
							'keybindingLabel.foreground': base00,
							'keybindingLabel.border': base04,
							'keybindingLabel.bottomBorder': base04,
							'debugExceptionWidget.background': base01,
							'editorMarkerNavigation.background': base01,
							'editorMarkerNavigationError.background': base0B,
							'editorMarkerNavigationWarning.background': base0D,
							'editorMarkerNavigationInfo.background': base09,
							'peekViewEditor.background': base01,
							'peekViewEditorGutter.background': base01,
							'peekViewEditor.matchHighlightBackground': base0C + '6f',
							'peekViewResult.background': '#00000000',
							'peekViewResult.fileForeground': base05,
							'peekViewResult.lineForeground': base03,
							'peekViewResult.matchHighlightBackground': base0C + '6f',
							'peekViewResult.selectionBackground': base01,
							'peekViewResult.selectionForeground': base05,
							'peekViewTitle.background': base02,
							'peekViewTitleDescription.foreground': base03,
							'peekViewTitleLabel.foreground': base05,
							'merge.currentContentBackground': base09 + '40',
							'merge.currentHeaderBackground': base09 + '40',
							'merge.incomingContentBackground': base0E + '60',
							'merge.incomingHeaderBackground': base0E + '60',
							'editorOverviewRuler.currentContentForeground': '#f00',
							'editorOverviewRuler.incomingContentForeground': base0E,
							'editorOverviewRuler.commonContentForeground': base0A,
							'panel.background': '#00000000',
							'panel.dropBackground': base01 + '6f',
							'menubar.background': base00,
							'menubar.selectionForeground': base00,
							'menubar.selectionBackground': accent,
							'menubar.selectionBorder': '#00000000',
							'menu.selectionBorder': '#00000000',
							'menu.border': frame,
							'menu.foreground': base04,
							'menu.background': base00,
							'menu.selectionForeground': base00,
							'menu.selectionBackground': accent,
							'menu.separatorBackground': base02,
							'quickInput.background': base00,
							'quickInput.foreground': base05,
							'quickInputList.focusBackground': accent,
							'quickInputList.focusForeground': base00,
							'symbolIcon.arrayForeground': base05,
							'symbolIcon.booleanForeground': base0C,
							'symbolIcon.classForeground': base0D,
							'symbolIcon.constantForeground': base0C,
							'symbolIcon.constructorForeground': base09,
							'symbolIcon.enumeratorForeground': base0C,
							'symbolIcon.enumeratorMemberForeground': base09,
							'symbolIcon.eventForeground': base0D,
							'symbolIcon.fieldForeground': base0B,
							'symbolIcon.fileForeground': base05,
							'symbolIcon.folderForeground': base05,
							'symbolIcon.functionForeground': base09,
							'symbolIcon.interfaceForeground': base09,
							'symbolIcon.keywordForeground': base0F,
							'symbolIcon.methodForeground': base09,
							'symbolIcon.moduleForeground': base05,
							'symbolIcon.namespaceForeground': base05,
							'symbolIcon.nullForeground': base0A,
							'symbolIcon.numberForeground': base0C,
							'symbolIcon.propertyForeground': base05,
							'symbolIcon.snippetForeground': base05,
							'symbolIcon.stringForeground': base0E,
							'symbolIcon.structForeground': base0D,
							'symbolIcon.textForeground': base05,
							'symbolIcon.variableForeground': base0B,
							'widget.shadow': '#00000000',
						},
					})

					Monaco.editor.setTheme('custom-theme')
				},
				{immediate: true, deep: true}
			)

			editor.onDidChangeModelContent(e => {
				const value = editor.getValue()
				if (props.modelValue !== value) {
					context.emit('update:modelValue', value, e)
				}
			})

			watch(
				() => props.modelValue,
				value => {
					if (editor.getValue() !== value) {
						editor.setValue(value)
					}
				}
			)
		})

		onUnmounted(() => {
			editor && editor.dispose()
		})
	},
})
</script>

<style lang="stylus">
.MonacoEditor
	width 100%
	height 20em
</style>
