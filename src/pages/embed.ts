import Vue from 'vue'
import ResizeSensor from 'resize-sensor'
import VueCompositionApi from '@vue/composition-api'
import App from '@/components/PageEmbed.vue'

Vue.config.productionTip = false
Vue.use(VueCompositionApi)

new Vue({
	render: h => h(App)
}).$mount('#app')

const el = document.documentElement
new ResizeSensor(el, () => {
	window.parent.postMessage('resize', '*')
})
