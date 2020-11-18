import {createApp} from 'vue'

import App from './Editor.vue'
import PDGInputExp from './PDGInputExp.vue'

const app = createApp(App)
app.component('PDGInputExp', PDGInputExp)

app.mount('#app')
