import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Same-origin /api in local dev so the UI does not hard-code :5000.
    // Production still needs CORS (or a reverse proxy) — see CLIENT_ORIGIN.
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
});
