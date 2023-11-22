import {mat2d} from 'linearly'
import {defineStore} from 'pinia'
import {ref} from 'vue'

export const useViewportStore = defineStore('viewport', () => {
	const transform = ref(mat2d.ident)

	return {transform}
})
