<script setup lang="ts">
import { useThemeStore } from 'tweeq/stores/theme'
import { computed } from 'vue'

import { runsOf } from './language'
import { colorOfToken } from './repl'

const props = defineProps<{ source: string }>()

const theme = useThemeStore()

const lines = computed(() => runsOf(props.source))
const colorOf = (type: string) => colorOfToken(type, theme.monacoTheme.rules)
</script>

<template>
	<template v-for="(line, i) in lines" :key="i">
		<br v-if="i > 0" /><span
			v-for="(run, j) in line"
			:key="j"
			:style="{ color: colorOf(run.type) }"
			>{{ run.text }}</span
		>
	</template>
</template>
