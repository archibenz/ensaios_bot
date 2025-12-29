import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,

    // Разрешаем доступ через cloudflared/Telegram по внешнему Host
    allowedHosts: [
      'news-photographers-twenty-ranger.trycloudflare.com',
      'junior-larry-generation-loc.trycloudflare.com',
      '.trycloudflare.com',
    ],

    // Не обязательно, но полезно если WebApp грузится "снаружи"
    hmr: {
      host: 'localhost',
      protocol: 'ws',
    },
  },
});
