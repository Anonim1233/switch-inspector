import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  css: {
    modules: {
      // Понятные имена классов в разработке, короткие в сборке.
      generateScopedName: process.env.NODE_ENV === 'production'
        ? '[hash:base64:6]'
        : '[name]__[local]',
    },
  },
  server: {
    port: 5173,
    // В разработке запросы к API уходят на локальный бэкенд, поэтому
    // обращения идут по относительным путям — как и в собранном виде.
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Тяжёлые библиотеки выносятся отдельно: они меняются редко,
        // поэтому браузер не будет перезагружать их при каждом обновлении
        // самого приложения.
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          charts: ['chart.js', 'react-chartjs-2'],
          xlsx: ['xlsx'],
        },
      },
    },
  },
});
