import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      // игра и отдельная страница /styleguide (пути — от корня проекта)
      input: {
        main: 'index.html',
        styleguide: 'styleguide/index.html',
      },
    },
  },
});
