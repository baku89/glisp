import {createApp} from 'vue'
import App from '@/components/PageIndex'
import PortalVue from 'portal-vue'

const app = createApp(App)
app.use(PortalVue)
app.mount('#app')
