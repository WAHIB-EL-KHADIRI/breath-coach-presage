// Prints the SDK's own readiness policy for the chest/breathing workload: the numbers Presage itself uses to decide
// whether a computer can sustain a measurement (target fps, minimum throughput fps, frame size, duration).
// Reads only; calls one exported function of the shipped native library through koffi. No key, no camera.
const path = require('node:path');
const koffi = require('koffi');
require('@smartspectra/node-sdk'); // loads the platform package's native runtime the supported way

const dll = path.join(path.dirname(require.resolve('@smartspectra/node-sdk-win32-x64/package.json')), 'smartspectra_capi.dll');
const lib = koffi.load(dll);

koffi.struct('smartspectra_readiness_requirement_t', { metric_id: 'int', minimum_samples: 'uint64_t', minimum_output_hz: 'double', output_required: 'int' });
const Policy = koffi.struct('smartspectra_readiness_policy_t', {
  version: 'const char*',
  rationale: 'const char*',
  input_mode: 'const char*',
  frame_width: 'int',
  frame_height: 'int',
  target_fps: 'double',
  minimum_throughput_fps: 'double',
  minimum_duration_us: 'uint64_t',
  metrics: 'const smartspectra_readiness_requirement_t*',
  metrics_len: 'size_t',
  early_window_us: 'uint64_t',
  early_stable_windows: 'uint32_t',
  early_minimum_headroom: 'double',
  uncertainty_fraction: 'double',
});

const chestPolicy = lib.func('int smartspectra_readiness_chest_policy(_Out_ smartspectra_readiness_policy_t *out)');
const out = {};
const rc = chestPolicy(out);
const big = (v) => (typeof v === 'bigint' ? Number(v) : v);
console.log(
  JSON.stringify(
    {
      returnCode: rc,
      version: out.version,
      inputMode: out.input_mode,
      frame: `${out.frame_width}x${out.frame_height}`,
      targetFps: out.target_fps,
      minimumThroughputFps: out.minimum_throughput_fps,
      minimumDurationSeconds: big(out.minimum_duration_us) / 1e6,
      uncertaintyFraction: out.uncertainty_fraction,
      rationale: out.rationale,
    },
    null,
    2,
  ),
);
