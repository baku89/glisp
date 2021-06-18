<template>
	<menu class="GlobalMenu2">
		<h1 class="GlobalMenu2__title">'(GLISP)</h1>
		<slot name="left" />
	</menu>
</template>

<style lang="stylus">
@import '~@/components/style/common.styl'

$height = 3.4em

glass-bg()
	background base16('00', 0.9)
	backdrop-filter blur(10px) grayscale(1)

.GlobalMenu2
	position relative
	display flex
	overflow visible
	height $height
	border-bottom 1px solid $color-frame
	glass-bg()
	user-select none
	--height $height

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
</style>
