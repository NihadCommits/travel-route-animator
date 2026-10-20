import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    // Local tool: never expose the dev server to the network.
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
});
