<template>
	<section class="PaneDocument">
		<Markdown :source="doc" />
	</section>
</template>

<script lang="ts">
import {defineComponent, ref} from 'vue'

import Markdown from '@/components/layouts/Markdown'

import SampleDoc from './sample-doc.md'

export default defineComponent({
	components: {Markdown},
	setup() {
		const doc = ref(SampleDoc)

		return {doc}
	},
})
</script>
