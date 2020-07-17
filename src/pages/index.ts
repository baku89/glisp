import Vue from 'vue'
import VueCompositionApi from '@vue/composition-api'
import App from '@/components/PageIndex'
import VModal from 'vue-js-modal'

Vue.config.productionTip = false
Vue.use(VueCompositionApi)
Vue.use(VModal, {dynamic: true})

new Vue({
	render: h => h(App)
}).$mount('#app')
