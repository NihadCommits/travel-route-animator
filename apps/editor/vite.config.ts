import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    // Local tool: never expose the dev server to the network.
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // The editor only ever talks to its own server; the server talks to the outside world.
    proxy: { '/api': 'http://127.0.0.1:5174' },
  },
});
