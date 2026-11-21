import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Content-Security-Policy is injected at build time so the dev server can allow
 * its HMR websocket while the shipped bundle stays strict.
 */
function csp(): Plugin {
  const base = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self'",
    "worker-src 'self' blob:", // required by the SmartSpectra renderer frame worker
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ];
  return {
    name: 'breath-coach-csp',
    transformIndexHtml(html, ctx) {
      const dev = Boolean(ctx.server);
      const policy = [
        ...base,
        dev ? "connect-src 'self' ws://localhost:5173 http://localhost:5173" : "connect-src 'none'",
      ].join('; ');
      return html.replace('%CSP%', policy);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), csp()],
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false, target: 'chrome140' },
});
