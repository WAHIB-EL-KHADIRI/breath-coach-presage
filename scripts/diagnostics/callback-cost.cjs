// Measures what the SDK's JS glue does for EVERY processed video frame (ffi.js wrapVideoOutput):
//   Buffer.from(koffi.decode(ptr, koffi.array('uint8_t', len)))
// and compares it with a typed-array copy. Pure CPU micro-benchmark: no camera, no key, no SDK session.
const koffi = require('koffi');

const SIZES = [
  ['640x480 BGR (921,600 B)', 640 * 480 * 3],
  ['1280x720 BGR (2,764,800 B)', 1280 * 720 * 3],
];
const src = Buffer.alloc(1280 * 720 * 3, 7);

function time(label, fn, n = 15) {
  fn(); // warm-up
  const t = [];
  for (let i = 0; i < n; i++) {
    const a = process.hrtime.bigint();
    fn();
    t.push(Number(process.hrtime.bigint() - a) / 1e6);
  }
  t.sort((x, y) => x - y);
  const avg = t.reduce((s, v) => s + v, 0) / t.length;
  return { label, avgMs: +avg.toFixed(2), p95Ms: +t[Math.floor(t.length * 0.95) - 1 ?? 0].toFixed(2) };
}

const probe = koffi.decode(src, koffi.array('uint8_t', 16));
console.log('koffi.decode(uint8_t array) returns:', Array.isArray(probe) ? 'a plain JS Array (one number per byte)' : probe.constructor.name);

for (const [name, len] of SIZES) {
  const sdkWay = time('SDK glue: Buffer.from(koffi.decode(...))', () => Buffer.from(koffi.decode(src, koffi.array('uint8_t', len))));
  const typed = time('typed copy: Buffer.from(src.subarray)', () => Buffer.from(src.subarray(0, len)));
  console.log(`\n${name}`);
  console.log(`  ${sdkWay.label}: avg ${sdkWay.avgMs} ms, p95 ${sdkWay.p95Ms} ms  → max ${(1000 / sdkWay.avgMs).toFixed(1)} frames/s if this alone ran`);
  console.log(`  ${typed.label}: avg ${typed.avgMs} ms`);
}
