// Scans every git-tracked file for things that look like secrets. Exit code 1 when something is found.
// Run before every commit and in CI:  npm run check:secrets
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const RULES = [
  ['private key block', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/],
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b/],
  ['AWS access key id', /\bAKIA[0-9A-Z]{16}\b/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  ['hard-coded credential assignment', /\b(?:api[_-]?key|secret|token|passw(?:or)?d)\b\s*[:=]\s*['"`][A-Za-z0-9_\-+/=]{20,}['"`]/i],
  ['40-character alphanumeric literal (the shape of a Presage API key)', /['"`][A-Za-z0-9]{40}['"`]/],
];
const SKIP = new Set(['package-lock.json']);

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split(String.fromCharCode(0)).filter(Boolean);
let hits = 0;
for (const file of files) {
  if (SKIP.has(file) || /\.(png|jpg|jpeg|gif|ico|woff2?|zip)$/i.test(file)) continue;
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  text.split(String.fromCharCode(10)).forEach((line, i) => {
    for (const [name, re] of RULES) {
      if (re.test(line)) {
        hits++;
        // Never print the matching text: only where it is and which rule fired.
        console.error(`${file}:${i + 1}  ${name}`);
      }
    }
  });
}
if (hits > 0) {
  console.error(`\n${hits} possible secret(s). If one is real: revoke it first, then remove it from the repository.`);
  process.exit(1);
}
console.log(`No secrets found in ${files.length} tracked files.`);
