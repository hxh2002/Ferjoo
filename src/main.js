import { createApp } from 'vue';
import App from './App.vue';
import router from './router/index.js';
import './assets/styles/main.css';
import { useAuth } from './composables/useAuth.js';

const auth = useAuth();
await auth.init();

createApp(App).use(router).mount('#app');
