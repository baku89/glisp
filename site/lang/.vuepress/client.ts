import { createPinia } from 'pinia'
import { defineClientConfig } from 'vuepress/client'

export default defineClientConfig({
	enhance({ app }) {
		app.use(createPinia())
	},
})
