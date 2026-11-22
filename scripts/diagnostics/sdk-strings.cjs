// Read-only: extracts printable strings that mention darkness / brightness / luminance thresholds from the SDK's graph and native library.
// Purpose: find what the SDK's "Too dark" validation compares against, instead of guessing. No camera, no key, nothing is modified.
const fs = require('node:fs');
const path = require('node:path');

const pkg = path.dirname(require.resolve('@smartspectra/node-sdk-win32-x64/package.json'));
const targets = [path.join(pkg, 'graph', 'metrics_cpu_continuous_rest.binarypb'), path.join(pkg, 'smartspectra.dll'), path.join(pkg, 'smartspectra_capi.dll')];
const re = /(too[_ ]?dark|too[_ ]?bright|dark|bright|luminan|luma|exposure|min_?brightness|max_?brightness|brightness)/i;

for (const file of targets) {
  if (!fs.existsSync(file)) continue;
  const buf = fs.readFileSync(file);
  const hits = new Set();
  let run = '';
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i];
    if (c >= 32 && c < 127) {
      run += String.fromCharCode(c);
    } else {
      if (run.length >= 6 && run.length <= 200 && re.test(run)) hits.add(run.trim());
      run = '';
    }
  }
  console.log(`\n${path.basename(file)} (${(buf.length / 1048576).toFixed(1)} MB): ${hits.size} matching strings`);
  [...hits].slice(0, 25).forEach((h) => console.log('  ' + h));
}
