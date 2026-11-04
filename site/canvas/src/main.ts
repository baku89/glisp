import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import { createPinia } from 'pinia'
import { vTooltip } from 'tweeq/Tooltip'
import { createApp } from 'vue'

import App from './App.vue'

self.MonacoEnvironment = { getWorker: () => new EditorWorker() }

createApp(App).use(createPinia()).directive('tooltip', vTooltip).mount('#app')
