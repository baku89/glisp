import {ref} from '@vue/composition-api'

export default function useRem() {
	const rem = ref(
		parseFloat(getComputedStyle(document.documentElement).fontSize)
	)
	return rem
}
