import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server proxies /api → the eGovMed backend so the browser can call it without CORS friction.
// Override the backend target with VITE_API_PROXY (e.g. http://localhost:4000).
export default defineConfig(() => {
  const target = process.env.VITE_API_PROXY || 'http://localhost:4000';
  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 3000,
      strictPort: true,
      proxy: { '/api': { target, changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') } },
    },
  };
});
