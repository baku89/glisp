<template>
	<menu class="GlobalMenu2" :class="{'title-bar-macos': titleBar === 'macos'}">
		<h1 class="GlobalMenu2__title">'(GLISP)</h1>
		<slot name="left" />
	</menu>
</template>

<script lang="ts">
import {defineComponent, ref} from 'vue-demi'

export default defineComponent({
	name: 'GlobalMenu2',
	setup() {
		const titleBar = ref(
			/electron/i.test(navigator.userAgent)
				? /mac/i.test(navigator.platform)
					? 'macos'
					: 'frameless'
				: null
		)

		return {titleBar}
	},
})
</script>
<style lang="stylus">
@import '~@/components/style/common.styl'

$height = 3.2em

.GlobalMenu2
	position relative
	display flex
	overflow visible
	height $height
	border-bottom 1px solid $color-frame
	glass-bg('pane')
	--height $height
	-webkit-app-region drag

	&__title
		position relative
		overflow hidden
		margin 0 0 0 0.5em
		width $height
		height $height
		background base16('05')
		background-size 100% 100%
		text-align center
		text-indent 10em
		font-weight normal
		font-size 1em
		mask-image url('../../logo.png')
		mask-size 60% 60%
		mask-repeat no-repeat
		mask-position 50% 50%
		-webkit-app-region no-drag

	&.title-bar-macos &__title
		margin-left calc(65px + 0.5em)
</style>
