import {createApp} from 'vue'

import App from './Interpreter.vue'
import PDGInputExp from './PDGInputExp.vue'

const app = createApp(App)
app.component('PDGInputExp', PDGInputExp)

app.mount('#app')
