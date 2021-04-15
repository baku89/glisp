<template>
	<dl class="ExpInputScope">
		<template v-for="[name, exp] in varList" :key="name">
			<dt class="ExpInputScope__name">{{ name }}</dt>
			<dd>{{ exp }}</dd>
			<dd></dd
		></template>

		<pre class="Interpreter__vars">{{ varsStr }}</pre>
	</dl>
</template>

<script lang="ts">
import {computed, defineComponent, PropType} from 'vue'

import {ExpScope, printForm} from '../glisp'

export default defineComponent({
	name: 'ExpInputScope',
	props: {
		exp: {
			type: Object as PropType<ExpScope>,
			required: true,
		},
	},
	emits: [],
	setup(props) {
		const vars = computed(() => props.exp.vars)

		const varList = computed(() => {
			return Object.entries(
				vars.value as ExpScope['vars']
			).map(([name, exp]) => [name, printForm(exp)])
		})

		return {varList}
	},
})
</script>

<style lang="stylus" scoped>
@import '~@/components/style/common.styl'

.ExpInputScope
	font-monospace()

	&__name
		color var(--menu-foreground)
</style>
