import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Mirrors the /api rewrite in the root vercel.json for plain `npm run dev`.
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
});
