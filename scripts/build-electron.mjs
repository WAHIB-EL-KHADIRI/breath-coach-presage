// Bundles the Electron main process and the sandboxed preload.
// The official SmartSpectra preload only needs `electron`, so it is inlined into
// our preload; that keeps `sandbox: true` on the BrowserWindow.
import { build } from 'esbuild';

const common = { bundle: true, platform: 'node', target: 'node22', sourcemap: false, logLevel: 'info' };

await build({
  ...common,
  entryPoints: ['electron/main.ts'],
  outfile: 'dist-electron/main.cjs',
  format: 'cjs',
  external: ['electron', '@smartspectra/node-sdk', '@smartspectra/node-sdk/*', 'koffi', 'protobufjs'],
});

await build({
  ...common,
  entryPoints: ['electron/preload.ts'],
  outfile: 'dist-electron/preload.cjs',
  format: 'cjs',
  external: ['electron'],
});
