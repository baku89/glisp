<template lang="pug">
HelloWorld(msg='Welcome to Your Vue.js + TypeScript App')
</template>

<script lang="ts">
import {defineComponent} from 'vue'

import HelloWorld from './components/HelloWorld.vue'

export default defineComponent({
	name: 'App',
	components: {
		HelloWorld,
	},
})
</script>

<style lang="stylus">
#app
	margin-top 60px
	color #2c3e50
	text-align center
	font-family Avenir, Helvetica, Arial, sans-serif
	-webkit-font-smoothing antialiased
	-moz-osx-font-smoothing grayscale
</style>
