import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const electronBinary = require('electron');

execFileSync(process.execPath, ['scripts/build-electron.mjs'], { stdio: 'inherit' });
const server = await createServer({ server: { port: 5173, strictPort: true } });
await server.listen();

const child = spawn(electronBinary, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: 'http://localhost:5173/' },
});
child.on('exit', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
