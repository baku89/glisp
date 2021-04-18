<template>
	<dl class="PaneSchemeViewer">
		<div>
			<dt class="border" style="background: rgb(var(--base00))">00</dt>
			<dd>BG</dd>
		</div>
		<div>
			<dt style="background: rgb(var(--base01))">01</dt>
			<dd>Input BG</dd>
		</div>
		<div>
			<dt style="background: rgb(var(--base02))">02</dt>
			<dd>Selection</dd>
		</div>
		<div>
			<dt style="background: rgb(var(--base03))">03</dt>
			<dd>Comments, Line Highlighting</dd>
		</div>
		<div>
			<dt class="invert" style="background: rgb(var(--base04))">04</dt>
			<dd>Text, Label</dd>
		</div>
		<div>
			<dt class="invert" style="background: rgb(var(--base05))">05</dt>
			<dd>FG, Caret, Delimiters, Operators</dd>
		</div>
		<div>
			<dt class="invert" style="background: rgb(var(--base06))">06</dt>
			<dd>Input Value</dd>
		</div>
		<div>
			<dt
				class="invert"
				:class="{accent: baseAccentName === '07'}"
				style="background: rgb(var(--base07))"
			>
				07
			</dt>
			<dd>Light BG</dd>
		</div>
		<div>
			<dt
				class="invert"
				style="background: rgb(var(--base08))"
				:class="{accent: baseAccentName === '08'}"
			>
				08
			</dt>
			<dd>Variables, Deleted</dd>
		</div>
		<div>
			<dt
				class="invert"
				style="background: rgb(var(--base09))"
				:class="{accent: baseAccentName === '09'}"
			>
				09
			</dt>
			<dd>Integers, Boolean, Constants</dd>
		</div>
		<div>
			<dt
				class="invert"
				style="background: rgb(var(--base0A))"
				:class="{accent: baseAccentName === '0A'}"
			>
				0A
			</dt>
			<dd>Classes, Markup Bold, Search Text Background</dd>
		</div>
		<div>
			<dt
				class="invert"
				style="background: rgb(var(--base0B))"
				:class="{accent: baseAccentName === '0B'}"
			>
				0B
			</dt>
			<dd>Strings, Inserted</dd>
		</div>
		<div>
			<dt
				class="invert"
				style="background: rgb(var(--base0C))"
				:class="{accent: baseAccentName === '0C'}"
			>
				0C
			</dt>
			<dd>Support, Regular Expressions, Escape Characters</dd>
		</div>
		<div>
			<dt
				class="invert"
				style="background: rgb(var(--base0D))"
				:class="{accent: baseAccentName === '0D'}"
			>
				0D
			</dt>
			<dd>Functions, Headings</dd>
		</div>
		<div>
			<dt
				class="invert"
				style="background: rgb(var(--base0E))"
				:class="{accent: baseAccentName === '0E'}"
			>
				0E
			</dt>
			<dd>Keywords, Changed</dd>
		</div>
		<div>
			<dt
				class="invert"
				style="background: rgb(var(--base0F))"
				:class="{accent: baseAccentName === '0F'}"
			>
				0F
			</dt>
			<dd>Deprecated</dd>
		</div>
	</dl>
</template>

<script lang="ts">
import {defineComponent} from 'vue'

export default defineComponent({
	props: {
		baseAccentName: {
			type: String,
			required: true,
		},
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/common.styl'

.PaneSchemeViewer
	position relative
	display grid
	grid-template-columns 100%
	grid-template-rows repeat(16, 3em)
	grid-auto-flow column
	gap 0.3em

	div
		display grid
		grid-template-columns 3em 1fr

	dt
		border-radius $input-round
		text-align center
		font-size 1.4em
		line-height: (3em / @font-size)
		font-title()

		&.border
			border 1px solid $color-frame

		&.invert
			color base16('00')

		&.accent
			box-shadow inset 0 0 0 1px base16('04'), 0 0 0 1px base16('04'), inset 0 0 0 2px base16('00')

	dd
		padding-left 1em
</style>
