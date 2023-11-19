import {ref} from 'vue'

export default function useRem() {
	const rem = ref(
		parseFloat(getComputedStyle(document.documentElement).fontSize)
	)
	return rem
}
