import Vue from 'vue'
import VueCompositionApi from '@vue/composition-api'
import App from '@/components/PageIndex'
import VModal from 'vue-js-modal'
import PortalVue from 'portal-vue'

Vue.config.productionTip = false
Vue.use(VueCompositionApi)
Vue.use(VModal, {
	dynamicDefaults: {
		height: 'auto',
		width: 400,
		transition: 'vmodal__transition',
		overlayTransition: 'vmodal__overlay-transition',
	},
})
Vue.use(PortalVue)

new Vue({
	render: h => h(App),
}).$mount('#app')
