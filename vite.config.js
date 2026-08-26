import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served from https://neilp211.github.io/heelseek/, so assets need that prefix.
// Override with BASE=/ when running a plain local preview at the root.
export default defineConfig({
  base: process.env.BASE ?? '/heelseek/',
  plugins: [react()],
  build: { outDir: 'dist', assetsDir: 'assets' },
});
