<script lang="ts" setup>
import {computed} from 'vue'

import {useSketchStore} from '@/stores/sketch'

import ViewExprTree from './ViewExprTree.vue'

const sketch = useSketchStore()

const children = computed(() => sketch.expr.slice(1))
</script>

<template>
	<ViewExprTree v-for="(child, i) in children" :key="i" :expr="child" />
</template>
