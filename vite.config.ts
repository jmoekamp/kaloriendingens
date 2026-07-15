import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Frontend laeuft im Dev auf 5173, das Backend (Express) auf 3010.
// Alle /api-Aufrufe werden im Dev an das Backend weitergeleitet.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3010',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts', 'server/**/*.test.ts'],
  },
});
