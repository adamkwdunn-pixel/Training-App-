import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// A new id for every build. The app has it baked in; the server reads dist/version.json.
// When they differ, the app knows a newer version has been deployed.
const BUILD_ID = process.env.RENDER_GIT_COMMIT?.slice(0, 12) || `${Date.now().toString(36)}`;

export default defineConfig({
  root: 'client',
  plugins: [
    react(),
    {
      name: 'build-version',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: BUILD_ID }) });
      },
    },
  ],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  build: { outDir: '../dist', emptyOutDir: true },
  server: { host: true, proxy: { '/api': 'http://localhost:3000' } },
});
