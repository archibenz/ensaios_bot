import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: [
      'news-photographers-twenty-ranger.trycloudflare.com',
      'junior-larry-generation-loc.trycloudflare.com',
    ],
  },
});
