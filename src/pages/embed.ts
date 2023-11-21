import ResizeSensor from 'resize-sensor'
import {createApp} from 'vue'

import App from '@/components/PageEmbed.vue'

const app = createApp(App)
app.mount('#app')

const el = document.documentElement
new ResizeSensor(el, () => {
	const data = [document.body.scrollWidth, document.body.scrollHeight]
	window.parent.postMessage(data, '*')
})
