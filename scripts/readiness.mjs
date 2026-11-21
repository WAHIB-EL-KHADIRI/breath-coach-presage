// Official SDK device-readiness verdict for this computer (telemetry off). Key from BC_KEY only; never printed.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import os from 'node:os';
try { os.setPriority(0, os.constants.priority.PRIORITY_HIGH); } catch {}
const { SmartSpectraSDK, CameraSelection, breathingMetrics } = require('@smartspectra/node-sdk');
const sdk = new SmartSpectraSDK({ apiKey: process.env.BC_KEY, requestedMetrics: [...breathingMetrics], enableTelemetry: false });
sdk.useCamera(CameraSelection.default, { width: 640, height: 480, fps: 30 });
try {
  const r = await Promise.race([sdk.checkDeviceReadiness(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout 120s')), 120000))]);
  console.log('VERDICT:', r.verdict);
  console.log('REASON:', String(r.reason).replace(process.env.BC_KEY, '[key]').slice(0, 600));
} catch (e) {
  console.log('ERROR:', String(e.message || e).replace(process.env.BC_KEY, '[key]').slice(0, 300));
}
await sdk.destroy();
process.exit(0);
