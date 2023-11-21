import 'tweeq/global.styl'
import 'floating-vue/dist/style.css'

import FloatingVue from 'floating-vue'
import {createPinia} from 'pinia'
import {createApp} from 'vue'

import App from '@/components/PageIndex'

const pinia = createPinia()

const app = createApp(App)

app.use(pinia)
app.use(FloatingVue)
app.mount('#app')
