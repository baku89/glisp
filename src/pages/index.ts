import { createApp } from 'vue'
import App from '@/components/PageIndex'

const app = createApp(App as any)

// app.use(VModal, {
// 	dynamicDefaults: {
// 		height: 'auto',
// 		width: 400,
// 		transition: 'vmodal__transition',
// 		overlayTransition: 'vmodal__overlay-transition',
// 	},
// })
app.mount('#app')
