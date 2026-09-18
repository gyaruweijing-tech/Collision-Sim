import { defineConfig } from 'vite';

// GitHub Pages serves the site from /<repo-name>/.
// The repository is named "Collision-Sim" — the case must match exactly.
export default defineConfig({
  base: '/Collision-Sim/',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
  },
});
