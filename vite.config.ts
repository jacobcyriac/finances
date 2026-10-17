import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';

// The browser build of @actual-app/api uses SharedArrayBuffer (via absurd-sql),
// which requires the page to be cross-origin isolated. Set COOP/COEP on the
// dev and preview servers; static hosts should set them in response headers.
// GitHub Pages cannot set custom headers, so index.html uses coi-serviceworker.
function setIsolationHeaders(res: { setHeader: (k: string, v: string) => void }): void {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
}

const crossOriginIsolation: PluginOption = {
  name: 'cross-origin-isolation',
  configureServer(server) {
    server.middlewares.use((_req, res, next) => {
      setIsolationHeaders(res);
      next();
    });
  },
  configurePreviewServer(server) {
    server.middlewares.use((_req, res, next) => {
      setIsolationHeaders(res);
      next();
    });
  },
};

export default defineConfig({
  // Relative URLs work both at the origin root and under GitHub Pages' /repo/ path.
  base: './',
  plugins: [react(), crossOriginIsolation],
});
