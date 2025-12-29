import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Разрешаем домены cloudflared quick tunnel (они меняются)
    allowedHosts: ['.trycloudflare.com'],
  },
});
